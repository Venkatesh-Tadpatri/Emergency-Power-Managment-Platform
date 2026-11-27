import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/LocalAuth";

import { AuthTokenBridge } from "./auth/AuthTokenBridge";
import { AppShell } from "./components/layout/AppShell";
import { ToastProvider } from "./components/common/Toast";
import { PlatformUsers } from "./pages/admin/PlatformUsers";
import { Callback } from "./pages/Callback";
import { Dashboard } from "./pages/Dashboard";
import { Landing } from "./pages/Landing";
import { MapView } from "./pages/MapView";
import { Profile } from "./pages/Profile";
import { AlarmsList } from "./pages/alarms/AlarmsList";
import { SiteAlarms } from "./pages/alarms/SiteAlarms";
import { Analytics } from "./pages/analytics/Analytics";
import { CompanyAlarms } from "./pages/companies/CompanyAlarms";
import { ArchivedCompanies } from "./pages/companies/ArchivedCompanies";
import { CompanyDashboard } from "./pages/companies/CompanyDashboard";
import { CompaniesList } from "./pages/companies/CompaniesList";
import { CompanyMap } from "./pages/companies/CompanyMap";
import { CompanyOnCall } from "./pages/companies/CompanyOnCall";
import { CompanyReports } from "./pages/companies/CompanyReports";
import { CustomerSettings } from "./pages/companies/CustomerSettings";
import { ReportDetail } from "./pages/reports/ReportDetail";
import { ArchivedResellers } from "./pages/resellers/ArchivedResellers";
import { ResellerAlarms } from "./pages/resellers/ResellerAlarms";
import { ResellerCompanies } from "./pages/resellers/ResellerCompanies";
import { ResellerBranding } from "./pages/resellers/ResellerBranding";
import { ResellerMap } from "./pages/resellers/ResellerMap";
import { ResellerUsers } from "./pages/resellers/ResellerUsers";
import { ResellersList } from "./pages/resellers/ResellersList";
import { Settings } from "./pages/settings/Settings";
import { CustomerSites } from "./pages/sites/CustomerSites";
import { ArchivedSites } from "./pages/sites/ArchivedSites";
import { ArchivedSystems } from "./pages/sites/ArchivedSystems";
import { SiteSystems } from "./pages/sites/SiteSystems";
import { SystemDetail } from "./pages/systems/SystemDetail";
import { AtsDetail, GeneratorDetail } from "./pages/systems/DeviceDetail";
import { MonitoredAssetsPage } from "./pages/systems/MonitoredAssets";
import { DeviceAdministration } from "./pages/admin/DeviceAdministration";
import { useMe } from "./queries/me";
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, VerifyEmailPage } from "./pages/auth/AuthPages";

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthTokenBridge />
        <Routes>
          <Route path="/callback" element={<Callback />} />
          <Route path="/login" element={<LoginPage />} />
          {/* Self-registration is closed: admins create accounts, users activate them via First-time login. */}
          <Route path="/register" element={<Navigate to="/login?mode=first-login" replace />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/*" element={<Gate />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}

function Gate() {
  const auth = useAuth();

  if (auth.isLoading) {
    return <div className="center-screen">Loading...</div>;
  }

  if (!auth.isAuthenticated) {
    return <Landing />;
  }

  return <PortalBootstrap />;
}

function PortalBootstrap() {
  const auth = useAuth();
  const meQuery = useMe(auth.isAuthenticated);

  // Do not mount the shell until the profile is available.  Previously the
  // header/sidebar briefly rendered with no `me` data and displayed the
  // misleading generic labels "Signed in" / "Welcome back, there!".
  if (meQuery.isPending) {
    const identity = auth.user?.profile.email || auth.user?.profile.preferred_username || "your account";
    return <div className="portal-bootstrap">
      <img src="/images/cpc-logo.png" alt="CPC" />
      <strong>Signing in as {identity}</strong>
      <span>Loading your portal access...</span>
      <div className="portal-bootstrap-bar"><i /></div>
    </div>;
  }

  if (meQuery.isError) {
    return <div className="portal-bootstrap"><img src="/images/cpc-logo.png" alt="CPC" /><strong>Unable to load your portal</strong><span>Your session is signed in, but the user profile could not be loaded.</span><button className="header-btn primary" onClick={() => meQuery.refetch()}>Retry</button></div>;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="map" element={<MapView />} />
        <Route path="alarms" element={<AlarmsList />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="users" element={<PlatformUsers />} />
        <Route path="settings" element={<Settings />} />
        <Route path="profile" element={<Profile />} />
        <Route path="device-administration" element={<SuperadminOnly><DeviceAdministration /></SuperadminOnly>} />

        <Route path="resellers" element={<ResellersList />} />
        <Route path="resellers/archived" element={<ArchivedResellers />} />
        <Route path="resellers/:resellerId" element={<Navigate to="companies" replace />} />
        <Route path="resellers/:resellerId/companies" element={<ResellerCompanies />} />
        <Route path="resellers/:resellerId/companies/archived" element={<ArchivedCompanies />} />
        <Route path="resellers/:resellerId/users" element={<ResellerUsers />} />
        <Route path="resellers/:resellerId/alarms" element={<ResellerAlarms />} />
        <Route path="resellers/:resellerId/map" element={<ResellerMap />} />
        <Route path="resellers/:resellerId/branding" element={<ResellerBranding />} />

        <Route path="companies" element={<CompaniesList />} />
        <Route path="companies/archived" element={<ArchivedCompanies />} />
        <Route path="companies/:companyId" element={<CustomerSites />} />
        <Route path="companies/:companyId/sites/archived" element={<ArchivedSites />} />
        <Route path="companies/:companyId/details" element={<Navigate to="../settings?tab=branding" replace />} />
        <Route path="companies/:companyId/settings" element={<CustomerSettings />} />
        <Route path="companies/:companyId/sites/:siteId" element={<SiteSystems />} />
        <Route path="companies/:companyId/sites/:siteId/systems/archived" element={<ArchivedSystems />} />
        <Route path="companies/:companyId/sites/:siteId/alarms" element={<SiteAlarms />} />
        <Route path="companies/:companyId/map" element={<CompanyMap />} />
        <Route path="companies/:companyId/alarms" element={<CompanyAlarms />} />
        <Route path="companies/:companyId/users" element={<Navigate to="../settings?tab=users" replace />} />
        <Route path="companies/:companyId/reports" element={<CompanyReports />} />
        <Route path="companies/:companyId/reports/:reportId" element={<ReportDetail />} />
        <Route path="companies/:companyId/oncall" element={<CompanyOnCall />} />

        <Route path="systems/:systemId" element={<SystemDetail />} />
        <Route path="systems/:systemId/device-administration" element={<SuperadminOnly><MonitoredAssetsPage /></SuperadminOnly>} />
        <Route path="systems/:systemId/monitored-assets" element={<SuperadminOnly><Navigate to="../device-administration" relative="path" replace /></SuperadminOnly>} />
        <Route path="systems/:systemId/ats" element={<AtsDetail />} />
        <Route path="systems/:systemId/ats/:atsId" element={<AtsDetail />} />
        <Route path="systems/:systemId/generators" element={<GeneratorDetail />} />
        <Route path="systems/:systemId/generators/:generatorId" element={<GeneratorDetail />} />
      </Route>
    </Routes>
  );
}

function SuperadminOnly({ children }: { children: React.ReactNode }) {
  const { data: me, isPending } = useMe(true);
  if (isPending) return <div className="center-screen">Checking access...</div>;
  return me?.role === "superadmin" ? children : <Navigate to="/" replace />;
}
