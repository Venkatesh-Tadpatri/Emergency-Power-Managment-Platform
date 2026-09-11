import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useAuth } from "react-oidc-context";

import { AuthTokenBridge } from "./auth/AuthTokenBridge";
import { AppShell } from "./components/layout/AppShell";
import { PlatformUsers } from "./pages/admin/PlatformUsers";
import { Callback } from "./pages/Callback";
import { Dashboard } from "./pages/Dashboard";
import { Landing } from "./pages/Landing";
import { MapView } from "./pages/MapView";
import { Profile } from "./pages/Profile";
import { AlarmsList } from "./pages/alarms/AlarmsList";
import { Analytics } from "./pages/analytics/Analytics";
import { CompanyAlarms } from "./pages/companies/CompanyAlarms";
import { CompanyDashboard } from "./pages/companies/CompanyDashboard";
import { CompanyDetails } from "./pages/companies/CompanyDetails";
import { CompaniesList } from "./pages/companies/CompaniesList";
import { CompanyMap } from "./pages/companies/CompanyMap";
import { CompanyOnCall } from "./pages/companies/CompanyOnCall";
import { CompanyReports } from "./pages/companies/CompanyReports";
import { CompanyUsers } from "./pages/companies/CompanyUsers";
import { ReportDetail } from "./pages/reports/ReportDetail";
import { ResellerAlarms } from "./pages/resellers/ResellerAlarms";
import { ResellerCompanies } from "./pages/resellers/ResellerCompanies";
import { ResellerDashboard } from "./pages/resellers/ResellerDashboard";
import { ResellerMap } from "./pages/resellers/ResellerMap";
import { ResellerUsers } from "./pages/resellers/ResellerUsers";
import { ResellersList } from "./pages/resellers/ResellersList";
import { Settings } from "./pages/settings/Settings";
import { CustomerSites } from "./pages/sites/CustomerSites";
import { SiteSystems } from "./pages/sites/SiteSystems";
import { SystemDetail } from "./pages/systems/SystemDetail";
import { AtsDetail, GeneratorDetail } from "./pages/systems/DeviceDetail";

export function App() {
  return (
    <BrowserRouter>
      <AuthTokenBridge />
      <Routes>
        <Route path="/callback" element={<Callback />} />
        <Route path="/*" element={<Gate />} />
      </Routes>
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

        <Route path="resellers" element={<ResellersList />} />
        <Route path="resellers/:resellerId" element={<ResellerDashboard />} />
        <Route path="resellers/:resellerId/companies" element={<ResellerCompanies />} />
        <Route path="resellers/:resellerId/users" element={<ResellerUsers />} />
        <Route path="resellers/:resellerId/alarms" element={<ResellerAlarms />} />
        <Route path="resellers/:resellerId/map" element={<ResellerMap />} />

        <Route path="companies" element={<CompaniesList />} />
        <Route path="companies/:companyId" element={<CustomerSites />} />
        <Route path="companies/:companyId/details" element={<CompanyDetails />} />
        <Route path="companies/:companyId/sites/:siteId" element={<SiteSystems />} />
        <Route path="companies/:companyId/map" element={<CompanyMap />} />
        <Route path="companies/:companyId/alarms" element={<CompanyAlarms />} />
        <Route path="companies/:companyId/users" element={<CompanyUsers />} />
        <Route path="companies/:companyId/reports" element={<CompanyReports />} />
        <Route path="companies/:companyId/reports/:reportId" element={<ReportDetail />} />
        <Route path="companies/:companyId/oncall" element={<CompanyOnCall />} />

        <Route path="systems/:systemId" element={<SystemDetail />} />
        <Route path="systems/:systemId/ats" element={<AtsDetail />} />
        <Route path="systems/:systemId/ats/:atsId" element={<AtsDetail />} />
        <Route path="systems/:systemId/generators" element={<GeneratorDetail />} />
        <Route path="systems/:systemId/generators/:generatorId" element={<GeneratorDetail />} />
      </Route>
    </Routes>
  );
}
