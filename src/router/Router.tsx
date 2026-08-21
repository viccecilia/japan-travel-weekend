import { Route, Routes } from "react-router-dom";
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
} from "../website/Website";
import {
  AppShell,
  AppHome,
  Login,
  AppTrips,
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
import { LegacyAppRedirect, RequireAccount } from "../app/auth";
import {AuthCallback,CreateAccount,ForgotPassword,ResetPassword} from "../app/AuthPages";
export function Router() {
  return (
    <Routes>
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
          <RequireAccount><AppShell><TripRoom /></AppShell></RequireAccount>
        }
      />
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
      <Route path="/app-demo" element={<LegacyAppRedirect />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
