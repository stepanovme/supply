import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import StockSelectView from '../views/StockSelectView.vue'
import ProjectsView from '../views/ProjectsView.vue'
import ProjectDetailView from '../views/ProjectDetailView.vue'
import BudgetDetailView from '../views/BudgetDetailView.vue'
import RequestDetailView from '../views/RequestDetailView.vue'
import RequestSupplierCreateView from '../views/RequestSupplierCreateView.vue'
import PublicRequestSupplierInvoiceView from '../views/PublicRequestSupplierInvoiceView.vue'
import UsersView from '../views/UsersView.vue'
import UserProfileView from '../views/UserProfileView.vue'
import OrganizationCreateView from '../views/OrganizationCreateView.vue'
import CounterpartyDetailView from '../views/CounterpartyDetailView.vue'
import InvoiceProcessView from '../views/InvoiceProcessView.vue'
import InvoiceComparisonView from '../views/InvoiceComparisonView.vue'
import InvoicesRegistryView from '../views/InvoicesRegistryView.vue'
import InvoiceDetailView from '../views/InvoiceDetailView.vue'
import InvoiceDeliveryPlanView from '../views/InvoiceDeliveryPlanView.vue'
import InvoicesGroupedView from '../views/InvoicesGroupedView.vue'
import WarehousesView from '../views/WarehousesView.vue'
import WarehouseDetailView from '../views/WarehouseDetailView.vue'
import NomenclatureFormView from '../views/NomenclatureFormView.vue'
import NomenclatureViewDetail from '../views/NomenclatureViewDetail.vue'
import WarehouseCategoryFormView from '../views/WarehouseCategoryFormView.vue'
import WarehouseWaybillFormView from '../views/WarehouseWaybillFormView.vue'
import UpdDocumentDetailView from '../views/UpdDocumentDetailView.vue'
import DealsView from '../views/DealsView.vue'
import PaymentsView from '../views/PaymentsView.vue'
import DocumentsView from '../views/DocumentsView.vue'
import ContractCreateView from '../views/ContractCreateView.vue'
import ContractDetailView from '../views/ContractDetailView.vue'
import DealDetailView from '../views/DealDetailView.vue'
import DeliveriesView from '../views/DeliveriesView.vue'
import DeliveryCreateView from '../views/DeliveryCreateView.vue'
import DeliveryDetailView from '../views/DeliveryDetailView.vue'
import DeliveryProcessView from '../views/DeliveryProcessView.vue'
import WikiView from '../views/WikiView.vue'
import ChatsView from '../views/ChatsView.vue'
import CommerceSellView from '../views/CommerceSellView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/projects',
      name: 'projects',
      component: ProjectsView,
    },
    {
      path: '/projects/:projectId/works/:workId',
      name: 'project-detail',
      component: ProjectDetailView,
    },
    {
      path: '/budgets/:budgetId',
      name: 'budget-detail',
      component: BudgetDetailView,
    },
    {
      path: '/requests/new',
      name: 'request-create',
      component: RequestDetailView,
    },
    {
      path: '/requests/:requestId',
      name: 'request-detail',
      component: RequestDetailView,
    },
    {
      path: '/request-suppliers/create/:requestId/:supplierId?',
      name: 'request-supplier-create',
      component: RequestSupplierCreateView,
    },
    {
      path: '/requests/:requestId/select-stock',
      name: 'request-select-stock',
      component: StockSelectView,
    },
    {
      path: '/request-suppliers/link/:code',
      name: 'request-supplier-public-link',
      component: PublicRequestSupplierInvoiceView,
    },
    {
      path: '/users',
      name: 'users',
      component: UsersView,
    },
    {
      path: '/user-profile/:userId?',
      name: 'user-profile',
      component: UserProfileView,
    },
    {
      path: '/organizations/create',
      name: 'organization-create',
      component: OrganizationCreateView,
    },
    {
      path: '/counterparties/:type/:id',
      name: 'counterparty-detail',
      component: CounterpartyDetailView,
    },
    {
      path: '/invoices/:invoiceId/process',
      name: 'invoice-process',
      component: InvoiceProcessView,
    },
    {
      path: '/invoices/:invoiceId',
      name: 'invoice-detail',
      component: InvoiceDetailView,
    },
    {
      path: '/invoices/:invoiceId/delivery-plan',
      name: 'invoice-delivery-plan',
      component: InvoiceDeliveryPlanView,
    },
    {
      path: '/invoices',
      name: 'invoices-registry',
      component: InvoicesRegistryView,
    },
    {
      path: '/invoices/groups',
      name: 'invoices-groups',
      component: InvoicesGroupedView,
    },
    {
      path: '/deals',
      name: 'deals',
      component: DealsView,
    },
    {
      path: '/payments',
      name: 'payments',
      component: PaymentsView,
    },
    {
      path: '/documents',
      name: 'documents',
      component: DocumentsView,
    },
    {
      path: '/documents/contracts/create',
      name: 'contract-create',
      component: ContractCreateView,
    },
    {
      path: '/documents/contracts/:id',
      name: 'contract-detail',
      component: ContractDetailView,
    },
    {
      path: '/deals/:dealId',
      name: 'deal-detail',
      component: DealDetailView,
    },
    {
      path: '/deliveries',
      name: 'deliveries',
      component: DeliveriesView,
    },
    {
      path: '/deliveries/new',
      name: 'delivery-create',
      component: DeliveryCreateView,
    },
    {
      path: '/deliveries/:deliveryId',
      name: 'delivery-detail',
      component: DeliveryDetailView,
    },
    {
      path: '/deliveries/:deliveryId/process',
      name: 'delivery-process',
      component: DeliveryProcessView,
    },
    {
      path: '/wiki',
      name: 'wiki',
      component: WikiView,
    },
    {
      path: '/chats',
      name: 'chats',
      component: ChatsView,
    },
    {
      path: '/commerce-sell',
      name: 'commerce-sell',
      component: CommerceSellView,
    },
    {
      path: '/requests/:requestId/invoices/compare',
      name: 'invoice-compare',
      component: InvoiceComparisonView,
    },
    {
      path: '/warehouses',
      name: 'warehouses',
      component: WarehousesView,
    },
    {
      path: '/warehouses/:warehouseId',
      name: 'warehouse-detail',
      redirect: (to) => ({
        name: 'warehouse-section',
        params: {
          warehouseId: to.params.warehouseId,
          section: 'stock',
        },
        query: to.query,
      }),
    },
    {
      path: '/warehouses/:warehouseId/:section(stock|nomenclature|categories|incoming|outgoing|returns|inventory|deliveries|documents)',
      name: 'warehouse-section',
      component: WarehouseDetailView,
    },
    {
      path: '/nomenclature/new',
      name: 'nomenclature-create',
      component: NomenclatureFormView,
    },
    {
      path: '/nomenclature/:nomenclatureId',
      name: 'nomenclature-detail',
      component: NomenclatureFormView,
    },
    {
      path: '/nomenclature/:nomenclatureId/view',
      name: 'nomenclature-view',
      component: NomenclatureViewDetail,
    },
    {
      path: '/warehouse-categories/new',
      name: 'warehouse-category-create',
      component: WarehouseCategoryFormView,
    },
    {
      path: '/warehouse-categories/:categoryId',
      name: 'warehouse-category-detail',
      component: WarehouseCategoryFormView,
    },
    {
      path: '/warehouses/:warehouseId/waybills/:mode/new',
      name: 'warehouse-waybill-create',
      component: WarehouseWaybillFormView,
    },
    {
      path: '/warehouses/:warehouseId/waybills/:mode/:receiptId',
      name: 'warehouse-waybill-detail',
      component: WarehouseWaybillFormView,
    },
    {
      path: '/warehouses/:warehouseId/documents/:documentId',
      name: 'warehouse-document-detail',
      component: UpdDocumentDetailView,
    },
  ],
})

export default router
