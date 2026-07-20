import { createContext, useContext, useReducer, useEffect } from 'react';

const AppContext = createContext(null);

const initialState = {
  products: [],
  customers: [],
  suppliers: [],
  invoices: [],
  purchaseInvoices: [],
  company: {
    name: 'Loading...',
    address: '',
    phone: '',
    email: '',
    gstin: '',
    drugLicense: '',
    state: '',
    stateCode: '',
  },
  sidebarCollapsed: false,
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_INITIAL_DATA':
      return {
        ...state,
        ...action.payload,
      };

    case 'SET_PRODUCTS':
      return { ...state, products: action.payload };

    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };

    case 'ADD_PRODUCT_SUCCESS':
      return { ...state, products: [...state.products, action.payload] };

    case 'UPDATE_PRODUCT_SUCCESS': {
      const exists = state.products.some(p => p.id === action.payload.id);
      if (!exists) {
        return { ...state, products: [...state.products, action.payload] };
      }
      return {
        ...state,
        products: state.products.map(p => p.id === action.payload.id ? action.payload : p),
      };
    }

    case 'DELETE_PRODUCT_SUCCESS':
      return { ...state, products: state.products.filter(p => p.id !== action.payload) };

    case 'ADD_INVOICE_SUCCESS':
      return {
        ...state,
        invoices: [action.payload, ...state.invoices],
      };

    case 'DELETE_INVOICE_SUCCESS':
      return {
        ...state,
        invoices: state.invoices.filter(invoice => invoice.id !== action.payload),
      };

    case 'ADD_PURCHASE_SUCCESS':
      return {
        ...state,
        purchaseInvoices: [action.payload, ...state.purchaseInvoices],
      };

    case 'UPDATE_PURCHASE_DOCUMENT_SUCCESS':
      return {
        ...state,
        purchaseInvoices: state.purchaseInvoices.map(purchase =>
          purchase.id === action.payload.id
            ? {
                ...purchase,
                documentName: action.payload.documentName,
                documentMime: action.payload.documentMime,
                hasDocument: true,
              }
            : purchase
        ),
      };

    case 'ADD_CUSTOMER_SUCCESS':
      return { ...state, customers: [...state.customers, action.payload] };

    case 'ADD_SUPPLIER_SUCCESS':
      return { ...state, suppliers: [...state.suppliers, action.payload] };

    case 'UPDATE_SUPPLIER_SUCCESS':
      return {
        ...state,
        suppliers: state.suppliers.map(supplier =>
          supplier.id === action.payload.id ? action.payload : supplier
        ),
      };

    case 'DELETE_SUPPLIER_SUCCESS':
      return {
        ...state,
        suppliers: state.suppliers.filter(supplier => supplier.id !== action.payload),
      };

    case 'UPDATE_COMPANY_SUCCESS':
      return { ...state, company: action.payload };

    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Load initial data from the local Express API
  useEffect(() => {
    async function loadData() {
      try {
        const [products, customers, suppliers, invoices, purchases, company] = await Promise.all([
          fetch('/api/products').then(r => r.json()),
          fetch('/api/customers').then(r => r.json()),
          fetch('/api/suppliers').then(r => r.json()),
          fetch('/api/invoices').then(r => r.json()),
          fetch('/api/purchase-invoices').then(r => r.json()),
          fetch('/api/company').then(r => r.json()),
        ]);
        dispatch({
          type: 'SET_INITIAL_DATA',
          payload: { products, customers, suppliers, invoices, purchaseInvoices: purchases, company },
        });
      } catch (err) {
        console.error('Failed to fetch data from local Express SQLite API:', err);
      }
    }
    loadData();
  }, []);

  // Custom dispatch wrapper to handle backend API integration
  const asyncDispatch = async (action) => {
    try {
      const readJson = async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        return data;
      };
      const refreshProducts = async () => {
        const products = await fetch('/api/products').then(readJson);
        dispatch({ type: 'SET_PRODUCTS', payload: products });
      };

      switch (action.type) {
        case 'ADD_PRODUCT': {
          const res = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.payload),
          });
          const newProduct = await readJson(res);
          dispatch({ type: 'ADD_PRODUCT_SUCCESS', payload: newProduct });
          return newProduct;
        }

        case 'UPDATE_PRODUCT': {
          const res = await fetch(`/api/products/${action.payload.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.payload),
          });
          const updatedProduct = await readJson(res);
          dispatch({ type: 'UPDATE_PRODUCT_SUCCESS', payload: updatedProduct });
          return updatedProduct;
        }

        case 'ADJUST_INVENTORY': {
          const { productId, ...payload } = action.payload;
          const res = await fetch(`/api/products/${productId}/adjustments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const updatedProduct = await readJson(res);
          dispatch({ type: 'UPDATE_PRODUCT_SUCCESS', payload: updatedProduct });
          return updatedProduct;
        }

        case 'DELETE_PRODUCT': {
          await fetch(`/api/products/${action.payload}`, {
            method: 'DELETE',
          });
          dispatch({ type: 'DELETE_PRODUCT_SUCCESS', payload: action.payload });
          break;
        }

        case 'ADD_INVOICE': {
          const res = await fetch('/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.payload),
          });
          const newInvoice = await readJson(res);
          dispatch({ type: 'ADD_INVOICE_SUCCESS', payload: newInvoice });
          await refreshProducts();
          return newInvoice;
        }

        case 'DELETE_INVOICE': {
          const res = await fetch(
            `/api/invoices/${encodeURIComponent(action.payload)}`,
            { method: 'DELETE' }
          );
          const result = await readJson(res);
          dispatch({ type: 'DELETE_INVOICE_SUCCESS', payload: action.payload });
          await refreshProducts();
          return result;
        }

        case 'ADD_PURCHASE': {
          const { document, ...purchasePayload } = action.payload || {};
          const res = await fetch('/api/purchase-invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(purchasePayload),
          });
          let newPurchase = await readJson(res);

          // Attach uploaded bill in a second request (avoids huge JSON body failures).
          if (document?.dataBase64 && newPurchase?.id) {
            try {
              const docRes = await fetch(
                `/api/purchase-invoices/${encodeURIComponent(newPurchase.id)}/document`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(document),
                }
              );
              const docData = await docRes.json();
              if (!docRes.ok) throw new Error(docData.error || 'Document attach failed');
              newPurchase = {
                ...newPurchase,
                documentName: docData.documentName,
                documentMime: docData.documentMime,
                hasDocument: true,
              };
            } catch (docError) {
              console.error(docError);
              // Purchase is saved; warn but don't fail the whole save
              alert(
                `Purchase ${newPurchase.id} saved, but the document could not be attached: ${docError.message}`
              );
            }
          }

          dispatch({ type: 'ADD_PURCHASE_SUCCESS', payload: newPurchase });
          await refreshProducts();
          return newPurchase;
        }

        case 'ATTACH_PURCHASE_DOCUMENT': {
          const { id, document } = action.payload || {};
          if (!id || !document?.dataBase64) {
            throw new Error('Purchase id and document are required');
          }
          const docRes = await fetch(
            `/api/purchase-invoices/${encodeURIComponent(id)}/document`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(document),
            }
          );
          const docData = await readJson(docRes);
          dispatch({
            type: 'UPDATE_PURCHASE_DOCUMENT_SUCCESS',
            payload: {
              id,
              documentName: docData.documentName,
              documentMime: docData.documentMime,
            },
          });
          return docData;
        }

        case 'ADD_CUSTOMER': {
          const res = await fetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.payload),
          });
          const newCustomer = await readJson(res);
          dispatch({ type: 'ADD_CUSTOMER_SUCCESS', payload: newCustomer });
          return newCustomer;
        }

        case 'ADD_SUPPLIER': {
          const res = await fetch('/api/suppliers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.payload),
          });
          const newSupplier = await readJson(res);
          dispatch({ type: 'ADD_SUPPLIER_SUCCESS', payload: newSupplier });
          return newSupplier;
        }

        case 'UPDATE_SUPPLIER': {
          const res = await fetch(`/api/suppliers/${action.payload.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.payload),
          });
          const updatedSupplier = await readJson(res);
          dispatch({ type: 'UPDATE_SUPPLIER_SUCCESS', payload: updatedSupplier });
          return updatedSupplier;
        }

        case 'DELETE_SUPPLIER': {
          const res = await fetch(`/api/suppliers/${action.payload}`, {
            method: 'DELETE',
          });
          const result = await readJson(res);
          dispatch({ type: 'DELETE_SUPPLIER_SUCCESS', payload: action.payload });
          return result;
        }

        case 'UPDATE_COMPANY': {
          const res = await fetch('/api/company', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.payload),
          });
          const updatedCompany = await readJson(res);
          dispatch({ type: 'UPDATE_COMPANY_SUCCESS', payload: updatedCompany });
          return updatedCompany;
        }

        case 'UPDATE_CONSOLIDATED_SALE_PRODUCTS': {
          const res = await fetch('/api/settings/consolidated-sale-products', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productIds: action.payload }),
          });
          const result = await readJson(res);
          await refreshProducts();
          return result;
        }

        default:
          dispatch(action);
      }
    } catch (error) {
      console.error(`Failed to handle dispatch action [${action.type}]:`, error);
      throw error;
    }
  };

  return (
    <AppContext.Provider value={{ state, dispatch: asyncDispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
