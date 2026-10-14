# CPC Cloud Hosting Quotation Request

## Updated email

**Subject:** Request for US Cloud Architecture Proposal and Quotation — CPC Industrial Power Monitoring Platform

Dear Cloud Solutions Team,

We are seeking a technical architecture proposal and itemized quotation to deploy **CPC (Critical Power Command)** for customers in the United States. CPC is a multi-tenant industrial monitoring platform for emergency-power infrastructure, including generators, automatic transfer switches (ATS), meters, panels, and related assets.

The current application is containerized with Docker Compose and includes:

- React/Vite/TypeScript web dashboard and an Expo React Native mobile client
- Python FastAPI REST API with SQLAlchemy and Alembic migrations
- MySQL 8 application database
- MQTT ingestion for PLC/device telemetry and InfluxDB 2.x time-series storage
- Grafana dashboards and embedded analytics
- Zitadel OIDC authentication, backed by PostgreSQL, with application-level role and tenant scoping
- PDF operational reports, alarms, on-call information, equipment management, maps, and generated electrical one-line diagrams

Please recommend a secure US-region production architecture that preserves these capabilities and supports 24/7 operation. We prefer managed cloud services where they reduce operational risk, but the proposal should identify any application changes required to adopt them. The initial sizing assumptions in the attached technical specification are quotation baselines and should be validated during discovery.

Please provide two alternatives:

1. **Initial production:** cost-efficient, single-region deployment with backups and automated recovery.
2. **Highly available production:** multi-Availability-Zone deployment with enhanced resilience, monitoring, and support.

For each alternative, please itemize in USD:

- One-time architecture, deployment, security hardening, DNS/TLS, CI/CD, and migration charges
- Monthly and annual compute, database, time-series storage, MQTT, object storage, monitoring, backup, logging, network, and data-transfer costs
- Managed operations/support charges, service hours, incident response targets, and exclusions
- Scaling assumptions and estimated costs at 2× and 5× the baseline workload
- Service commitments/discounts, software licensing, taxes, and third-party charges
- Availability target, backup retention, recovery-point objective (RPO), and recovery-time objective (RTO)

The solution must include encryption in transit and at rest, least-privilege access, secrets management, audit/operational logging, health alerts, database backups, restore testing, and separation of development, staging, and production. Public anonymous Grafana access and development servers are not acceptable in production; Grafana must use authenticated access, and the web frontend must use a production-grade static/CDN or web-server deployment.

Please also state whether you recommend retaining the existing MQTT broker, using a managed MQTT/IoT service, or providing both options. We would appreciate a technical discovery call before the quotation is finalized.

Best regards,  
[Your Name]  
[Title / Company]  
[Business Email] | [Phone]  
[Company Website]

---

## One-page technical specification

| Item | Requirement |
| --- | --- |
| **Product and purpose** | CPC is a multi-tenant, 24/7 monitoring and management platform for emergency-power systems. It models reseller → customer → site → system → panel → device ownership and monitors generators, ATS units, meters, breakers, UPS units, fuel tanks, and related assets. |
| **User channels** | React 18/Vite/TypeScript browser application; Expo React Native iOS/Android application; REST API; embedded Grafana analytics. |
| **Application services** | Python 3/FastAPI API; SQLAlchemy ORM; Alembic migrations; background MQTT-to-InfluxDB telemetry bridge; PDF report generation. Containers are currently orchestrated with Docker Compose and must be adapted to a production container platform or equivalent managed services. |
| **Data services** | MySQL 8 is the system of record. InfluxDB 2.x stores time-series telemetry. Zitadel uses PostgreSQL 16. Persistent databases require managed backups, encryption, monitoring, point-in-time recovery where supported, and tested restoration procedures. Object storage should be provided for customer logos, generated reports, and other durable files as the platform evolves. |
| **Telemetry flow** | PLC/gateway → MQTT over TLS → backend ingestion/mapping → InfluxDB → scoped API/Grafana views. Topics follow `PLC-SERIAL/CUSTOMER-CODE/PANEL/DEVICE` with `/STATUS` and `/POWER` payloads. CSV and JSON payloads are supported. The default stored snapshot interval is 5 seconds (approximately 12 points/minute/device while connected). Each point is tenant/system/device tagged. |
| **Identity and authorization** | Zitadel OIDC/JWT authenticates users. CPC enforces local database RBAC and tenant scope for super administrator, reseller administrator, company administrator, system operator, and system viewer roles. Production requires MFA capability, secure SMTP for account workflows, secrets management, and authenticated Grafana access. |
| **Core functions** | Fleet/site/system dashboards; equipment and MQTT-topic configuration; latest telemetry and trends; alarm views; on-call lists; maps; generator-run and ATS-transfer PDF reports; customer branding; system testing workflow; generated interactive electrical one-line diagrams. |
| **Interfaces** | HTTPS for web/API/OIDC/Grafana; MQTT/MQTTS for device data; SMTP for identity notifications; outbound map/weather services if enabled. DNS, managed TLS certificates, web application firewall, restricted database networking, CORS configuration, and controlled administrative access are required. |
| **Quotation baseline (validate)** | US East region; production plus staging; 100 registered / 25 concurrent users; 500 telemetry devices; one MQTT connection per gateway/device as applicable; 5-second sampling; 12-month online telemetry retention; 100 GB initial relational data; 500 GB/month internet egress. Vendor must show the pricing formula and cost sensitivity for device count, payload size, retention, dashboard query rate, and egress. |
| **Availability and recovery** | Initial option: ≥99.9% service target, single region, automated restart, no single unbacked-up persistent volume, RPO ≤1 hour, RTO ≤4 hours. HA option: multi-zone application and databases, load balancing/autoscaling, RPO ≤15 minutes, RTO ≤1 hour. State assumptions, exclusions, and cross-region DR pricing separately. |
| **Security and operations** | Encryption in transit/at rest; least-privilege IAM; managed secrets and key rotation; vulnerability/patch management; WAF/firewall and rate limiting; centralized logs/metrics/traces; uptime, MQTT-disconnect, ingestion-lag, storage, database, and error-rate alerts; audit-log retention; monthly cost alerts; documented incident, backup, restore, and deployment runbooks. Applicable US/customer compliance requirements are to be confirmed during discovery. |
| **Required deliverables** | Architecture diagram and bill of materials; itemized monthly/annual estimate; initial and HA designs; 2×/5× scale estimates; CI/CD and environment design; migration/cutover/rollback plan; monitoring and DR design; responsibility matrix; implementation schedule; one-time and managed-support pricing. |

### Items to confirm before final pricing

Actual gateways/devices and MQTT connection model; average payload bytes and publish frequency; telemetry retention/downsampling; concurrent users and dashboard refresh rate; file/report volume; integration/VPN needs; target US region; data residency/compliance obligations; required SLA, RPO/RTO, support coverage, and growth forecast.
