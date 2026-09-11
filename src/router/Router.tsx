import { Route, Routes, useLocation } from "react-router-dom";
import {lazy,Suspense,useEffect,type ReactNode} from "react";
import {
  WebsiteLayout,
  Home,
  TripsPage,
  TripDetail,
  HowItWorks,
  RewardsPage,
  Safety,
  About,
  AppLanding,
  PrivateGroups,
  Terms,
  Privacy,
  CompanyLegal,
  CommercialTransactions,
  TravelConditions,
  CancellationLegal,
  AccessibilityLegal,
  CommunityGuidelines,
} from "../website/Website";
import {
  AppShell,
  AppHome,
  Login,
  AppTrips,
  AppNotifications,
  AppGuides,
  AppSupport,
  AppTrip,
  BookingPage,
  Passengers,
  Checkout,
  Payment,
  PaymentResult,
  Orders,
  OrderDetail,
  BoardingPass,
  AppRewards,
  Referral,
  Profile,
  NotFound,
} from "../app/App";
import { AppPrivateGroups, MyTrip, TripRoom } from "../app/TripRoom";
import { LegacyAppRedirect, RequireAccount, RequireStaff } from "../app/auth";
import {RequireOperations} from "../app/auth";
import {AccountStatus,AuthCallback,CreateAccount,ForgotPassword,ResetPassword} from "../app/AuthPages";
import {DesignLab} from "../app/DesignLab";
import {StaffPortal,StaffTaskAction} from "../app/StaffPortal";
import {AiGuide} from "../app/AiGuide";
import {OperationsLayout} from "../app/operations/OperationsLayout";
const OperationsDashboard=lazy(()=>import('../app/OperationsDashboard').then(module=>({default:module.OperationsDashboard})));
const ProductCenter=lazy(()=>import('../app/operations/ProductCenter').then(module=>({default:module.ProductCenter})));
const DepartureCenter=lazy(()=>import('../app/operations/DepartureCenter').then(module=>({default:module.DepartureCenter})));
const RunCenter=lazy(()=>import('../app/operations/RunCenter').then(module=>({default:module.RunCenter})));
const MarketingCenter=lazy(()=>import('../app/operations/MarketingCenter').then(module=>({default:module.MarketingCenter})));
const CommissionCenter=lazy(()=>import('../app/operations/CommissionCenter').then(module=>({default:module.CommissionCenter})));
const OperationsPage=({children}:{children:ReactNode})=><RequireAccount><RequireOperations><OperationsLayout><Suspense fallback={<main className="operations-page"><p>正在加载管理功能…</p></main>}>{children}</Suspense></OperationsLayout></RequireOperations></RequireAccount>;
function ScrollToTop(){const {pathname}=useLocation();useEffect(()=>{if(!navigator.userAgent.includes('jsdom'))window.scrollTo({top:0,left:0,behavior:'auto'});},[pathname]);return null;}
export function Router() {
  return (
    <><ScrollToTop/><Routes>
      <Route element={<WebsiteLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/trips/:slug" element={<TripDetail />} />
        <Route path="/private-groups" element={<PrivateGroups />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/rewards" element={<RewardsPage />} />
        <Route path="/safety" element={<Safety />} />
        <Route path="/about" element={<About />} />
        <Route path="/app-info" element={<AppLanding />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/legal/company" element={<CompanyLegal />} />
        <Route path="/legal/commercial-transactions" element={<CommercialTransactions />} />
        <Route path="/legal/privacy" element={<Privacy />} />
        <Route path="/legal/terms" element={<Terms />} />
        <Route path="/legal/travel-conditions" element={<TravelConditions />} />
        <Route path="/legal/cancellation" element={<CancellationLegal />} />
        <Route path="/legal/accessibility" element={<AccessibilityLegal />} />
        <Route path="/legal/community-guidelines" element={<CommunityGuidelines />} />
      </Route>
      <Route
        path="/app/login"
        element={
          <AppShell>
            <Login />
          </AppShell>
        }
      />
      <Route path="/app/create-account" element={<AppShell><CreateAccount /></AppShell>} />
      <Route path="/app/forgot-password" element={<AppShell><ForgotPassword /></AppShell>} />
      <Route path="/app/reset-password" element={<AppShell><ResetPassword /></AppShell>} />
      <Route path="/app/auth/callback" element={<AppShell><AuthCallback /></AppShell>} />
      <Route path="/app/account-status" element={<RequireAccount><AppShell><AccountStatus /></AppShell></RequireAccount>} />
      <Route
        path="/app"
        element={
          <AppShell nav>
            <AppHome />
          </AppShell>
        }
      />
      <Route
        path="/app/trips"
        element={
          <AppShell nav>
            <AppTrips />
          </AppShell>
        }
      />
      <Route path="/app/notifications" element={<AppShell nav><AppNotifications /></AppShell>} />
      <Route path="/app/guides" element={<AppShell nav><AppGuides /></AppShell>} />
      <Route path="/app/support" element={<AppShell nav><AppSupport /></AppShell>} />
      <Route
        path="/app/trips/:slug"
        element={
          <AppShell nav>
            <AppTrip />
          </AppShell>
        }
      />
      <Route
        path="/app/booking/:slug"
        element={
          <AppShell>
            <BookingPage />
          </AppShell>
        }
      />
      <Route
        path="/app/passengers"
        element={
          <RequireAccount><AppShell><Passengers /></AppShell></RequireAccount>
        }
      />
      <Route
        path="/app/checkout"
        element={
          <RequireAccount><AppShell><Checkout /></AppShell></RequireAccount>
        }
      />
      <Route
        path="/app/payment"
        element={
          <RequireAccount><AppShell><Payment /></AppShell></RequireAccount>
        }
      />
      <Route
        path="/app/payment-result"
        element={
          <RequireAccount><AppShell><PaymentResult /></AppShell></RequireAccount>
        }
      />
      <Route
        path="/app/orders"
        element={
          <RequireAccount><AppShell nav><Orders /></AppShell></RequireAccount>
        }
      />
      <Route
        path="/app/orders/:id"
        element={
          <RequireAccount><AppShell><OrderDetail /></AppShell></RequireAccount>
        }
      />
      <Route
        path="/app/my-trip"
        element={
          <RequireAccount><AppShell nav><MyTrip /></AppShell></RequireAccount>
        }
      />
      <Route
        path="/app/my-trip/room"
        element={
          <RequireAccount><AppShell nav><TripRoom /></AppShell></RequireAccount>
        }
      />
      <Route path="/app/ai-guide" element={<RequireAccount><AppShell nav><AiGuide/></AppShell></RequireAccount>} />
      <Route
        path="/app/private-groups"
        element={
          <AppShell>
            <AppPrivateGroups />
          </AppShell>
        }
      />
      <Route
        path="/app/boarding-pass/:id"
        element={
          <RequireAccount><AppShell><BoardingPass /></AppShell></RequireAccount>
        }
      />
      <Route
        path="/app/rewards"
        element={
          <RequireAccount><AppShell nav><AppRewards /></AppShell></RequireAccount>
        }
      />
      <Route
        path="/app/referral"
        element={
          <RequireAccount><AppShell><Referral /></AppShell></RequireAccount>
        }
      />
      <Route
        path="/app/profile"
        element={
          <RequireAccount><AppShell nav><Profile /></AppShell></RequireAccount>
        }
      />
      <Route path="/app-demo/*" element={<LegacyAppRedirect />} />
      <Route path="/app/operations" element={<OperationsPage><OperationsDashboard/></OperationsPage>} />
      <Route path="/app/operations/products" element={<OperationsPage><ProductCenter/></OperationsPage>} />
      <Route path="/app/operations/departures" element={<OperationsPage><DepartureCenter/></OperationsPage>} />
      <Route path="/app/operations/run" element={<OperationsPage><RunCenter/></OperationsPage>} />
      <Route path="/app/operations/marketing" element={<OperationsPage><MarketingCenter/></OperationsPage>} />
      <Route path="/app/operations/commissions" element={<OperationsPage><CommissionCenter/></OperationsPage>} />
      <Route path="/staff" element={<RequireAccount><RequireStaff><StaffPortal/></RequireStaff></RequireAccount>} />
      <Route path="/staff/schedule" element={<RequireAccount><RequireStaff><StaffPortal/></RequireStaff></RequireAccount>} />
      <Route path="/staff/map" element={<RequireAccount><RequireStaff><StaffPortal/></RequireStaff></RequireAccount>} />
      <Route path="/staff/messages" element={<RequireAccount><RequireStaff><StaffPortal/></RequireStaff></RequireAccount>} />
      <Route path="/staff/profile" element={<RequireAccount><RequireStaff><StaffPortal/></RequireStaff></RequireAccount>} />
      <Route path="/staff/tasks/:assignmentId/:action" element={<RequireAccount><RequireStaff><StaffTaskAction/></RequireStaff></RequireAccount>} />
      <Route path="/design-lab" element={<DesignLab />} />
      <Route path="/app-demo" element={<LegacyAppRedirect />} />
      <Route path="*" element={<NotFound />} />
    </Routes></>
  );
}
