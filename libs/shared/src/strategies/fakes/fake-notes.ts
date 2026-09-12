import type {
  AiChatMessage,
  AiUsageLogEntry,
  AiUsageSummaryRpc,
  AiUsageTimeseriesPoint,
  ApiKey,
  ApiKeyWithSecret,
  AuditLog,
  AuditLogFilters,
  AuditLogPage,
  StandardPatch,
  Framework,
  FrameworkControl,
  FrameworkRequirement,
  FrameworkRequirementPatch,
  InternalControl,
  InternalControlInput,
  InternalControlPatch,
  RequirementEvidence,
  RequirementAssessment,
  FrameworkActivity,
  FrameworkInput,
  FrameworkPatch,
  FrameworkStatus,
  GapAnalysis,
  GapAnalysisResult,
  NotesStrategy,
  Organization,
  OrganizationInput,
  PushSubscriptionPayload,
  ReportTemplate,
  ReportTemplateInput,
  RetentionPrefsPayload,
  DocumentStandard,
  StandardsDocument,
  StandardsSnapshot,
  UserPrefsPayload,
  Webhook,
  WebhookInput,
  WorkflowTransition,
  Exception,
  ExceptionInput,
  ExceptionPatch,
  Issue,
  IssueInput,
  IssuePatch,
  Asset,
  AssetInput,
  AssetPatch,
  Risk,
  RiskInput,
  RiskPatch,
  RiskLikelihood,
  RiskImpact,
  RiskAssessment,
  RiskAssessmentInput,
  RiskAssessmentPatch,
  RiskAssessmentItem,
  RiskAssessmentItemInput,
  RiskAssessmentItemPatch,
  RiskMethodology,
  RiskMethodologyInput,
  RiskTaxonomyCategory,
  RiskTaxonomyCategoryInput,
  RiskSnapshot,
  RiskScoreLabel,
  Policy,
  PolicyInput,
  PolicyPatch,
  PolicyTemplate,
  PolicyControl,
  PolicyControlInput,
  ControlFrameworkMappingInput,
  Finding,
} from '../notes';
import { DEFAULT_RETENTION_PREFS, DEFAULT_USER_PREFS, WORKFLOW_TRANSITIONS } from '../notes';

export class FakeNotesStrategy implements NotesStrategy {
  private frameworks = new Map<string, Framework>();
  private controls = new Map<string, FrameworkControl>();
  private requirements = new Map<string, FrameworkRequirement[]>(); // key = frameworkId
  private orgRequirementOverrides = new Map<string, Partial<FrameworkRequirement>>(); // key = `${orgId}:${frameworkId}:${reqCode}`
  private frameworkOrgStatus = new Map<string, FrameworkStatus>(); // key = `${orgId}:${frameworkId}`
  private internalControls: InternalControl[] = [];
  private findings: Finding[] = [];
  private evidence: RequirementEvidence[] = [];
  private assessmentsList: RequirementAssessment[] = [];
  private activities: FrameworkActivity[] = [];
  private orgs = new Map<string, Organization>(); // key = orgId
  private gapAnalyses: GapAnalysis[] = [];
  private docs = new Map<string, StandardsDocument>(); // key = id
  private snapshots: StandardsSnapshot[] = [];
  private userPrefs = new Map<string, UserPrefsPayload>();
  private pushSubscriptions = new Map<string, PushSubscriptionPayload[]>();
  private chatMessages = new Map<string, AiChatMessage[]>();
  private auditLogs = new Map<string, AuditLog[]>();
  private apiKeys = new Map<string, ApiKey[]>();
  private webhooks = new Map<string, Webhook[]>();
  private retentionPrefs = new Map<string, RetentionPrefsPayload>();
  private reportTemplates: ReportTemplate[] = [];
  private exceptions = new Map<string, Exception>();
  private issues = new Map<string, Issue>();

  constructor() {
    this.initDefaultSeedData();
  }

  private initDefaultSeedData(): void {
    const nistId = '00000000-0000-0000-0000-000000000003';
    const isoId = '00000000-0000-0000-0000-000000000002';
    const soc2Id = '00000000-0000-0000-0000-000000000001';
    const gdprId = '00000000-0000-0000-0000-000000000004';
    const pciId = '00000000-0000-0000-0000-000000000005';
    const cisId = '00000000-0000-0000-0000-000000000006';
    const nist80053Id = '00000000-0000-0000-0000-000000000007';
    const iso27701Id = '00000000-0000-0000-0000-000000000008';
    const pipedaId = '00000000-0000-0000-0000-000000000009';
    const iso31000Id = '00000000-0000-0000-0000-00000000000a';
    const nistRmfId = '00000000-0000-0000-0000-00000000000b';
    const cosoErmId = '00000000-0000-0000-0000-00000000000c';
    const csaCcmId = '00000000-0000-0000-0000-00000000000d';
    const iso27017Id = '00000000-0000-0000-0000-00000000000e';
    const hipaaId = '00000000-0000-0000-0000-00000000000f';

    const defaultFrameworks: Framework[] = [
      {
        id: nistId,
        slug: 'nist-csf',
        name: 'NIST CSF 2.0',
        description:
          'NIST Cybersecurity Framework 2.0 — Govern, Identify, Protect, Detect, Respond, Recover',
        version: '2.0',
        category: 'security',
        status: 'enabled',
        lastUpdated: '2024',
        controlCount: 106,
        functionsCount: 6,
        categoriesCount: 22,
        requirementsCount: 106,
        applicableCount: 89,
        notApplicableCount: 12,
        notReviewedCount: 5,
      },
      {
        id: isoId,
        slug: 'iso27001',
        name: 'ISO/IEC 27001:2022',
        description: 'International standard for information security management systems (ISMS)',
        version: '2022',
        category: 'security',
        status: 'configured',
        lastUpdated: '2022',
        controlCount: 93,
        functionsCount: 4,
        categoriesCount: 14,
        requirementsCount: 93,
        applicableCount: 74,
        notApplicableCount: 19,
        notReviewedCount: 0,
      },
      {
        id: soc2Id,
        slug: 'aicpa-tsc',
        name: 'AICPA Trust Services Criteria (TSC)',
        description:
          'AICPA Trust Services Criteria for Security, Availability, Processing Integrity, Confidentiality, and Privacy (baseline for SOC 1 and SOC 2 examinations)',
        version: '2017',
        category: 'regulatory',
        status: 'in_assessment',
        lastUpdated: '2023',
        controlCount: 64,
        functionsCount: 5,
        categoriesCount: 9,
        requirementsCount: 64,
        applicableCount: 58,
        notApplicableCount: 6,
        notReviewedCount: 0,
      },
      {
        id: cisId,
        slug: 'cis-v8',
        name: 'CIS Controls v8',
        description:
          'Center for Internet Security Critical Security Controls for Effective Cyber Defense',
        version: '8.0',
        category: 'security',
        status: 'available',
        lastUpdated: '2023',
        controlCount: 153,
        functionsCount: 3,
        categoriesCount: 18,
        requirementsCount: 153,
        applicableCount: 0,
        notApplicableCount: 0,
        notReviewedCount: 153,
      },
      {
        id: nist80053Id,
        slug: 'nist-800-53',
        name: 'NIST SP 800-53 Rev. 5',
        description: 'Security and Privacy Controls for Information Systems and Organizations',
        version: 'Rev. 5',
        category: 'security',
        status: 'available',
        lastUpdated: '2023',
        controlCount: 1007,
        functionsCount: 20,
        categoriesCount: 20,
        requirementsCount: 1007,
        applicableCount: 0,
        notApplicableCount: 0,
        notReviewedCount: 1007,
      },
      {
        id: pciId,
        slug: 'pci-dss',
        name: 'PCI DSS v4.0.1',
        description:
          'Payment Card Industry Data Security Standard for protecting cardholder and authentication data',
        version: '4.0.1',
        category: 'security',
        status: 'available',
        lastUpdated: '2024',
        controlCount: 250,
        functionsCount: 6,
        categoriesCount: 12,
        requirementsCount: 250,
        applicableCount: 0,
        notApplicableCount: 0,
        notReviewedCount: 250,
      },
      {
        id: gdprId,
        slug: 'gdpr',
        name: 'GDPR',
        description: 'General Data Protection Regulation — EU data protection and privacy law',
        version: '2018',
        category: 'privacy',
        status: 'available',
        lastUpdated: '2018',
        controlCount: 99,
        functionsCount: 7,
        categoriesCount: 11,
        requirementsCount: 99,
        applicableCount: 0,
        notApplicableCount: 0,
        notReviewedCount: 99,
      },
      {
        id: iso27701Id,
        slug: 'iso27701',
        name: 'ISO/IEC 27701:2019',
        description:
          'Privacy Information Management System (PIMS) extension to ISO/IEC 27001 and ISO/IEC 27002',
        version: '2019',
        category: 'privacy',
        status: 'available',
        lastUpdated: '2019',
        controlCount: 31,
        functionsCount: 4,
        categoriesCount: 8,
        requirementsCount: 31,
        applicableCount: 0,
        notApplicableCount: 0,
        notReviewedCount: 31,
      },
      {
        id: pipedaId,
        slug: 'pipeda',
        name: 'PIPEDA',
        description:
          'Personal Information Protection and Electronic Documents Act (Canada federal private-sector privacy law)',
        version: '2000/2024',
        category: 'privacy',
        status: 'available',
        lastUpdated: '2024',
        controlCount: 10,
        functionsCount: 1,
        categoriesCount: 10,
        requirementsCount: 10,
        applicableCount: 0,
        notApplicableCount: 0,
        notReviewedCount: 10,
      },
      {
        id: iso31000Id,
        slug: 'iso31000',
        name: 'ISO 31000:2018',
        description:
          'Risk management guidelines — Principles, framework, and process for enterprise risk governance',
        version: '2018',
        category: 'risk',
        status: 'available',
        lastUpdated: '2018',
        controlCount: 24,
        functionsCount: 3,
        categoriesCount: 6,
        requirementsCount: 24,
        applicableCount: 0,
        notApplicableCount: 0,
        notReviewedCount: 24,
      },
      {
        id: nistRmfId,
        slug: 'nist-rmf',
        name: 'NIST RMF (SP 800-37 Rev. 2)',
        description:
          'Risk Management Framework for Information Systems and Organizations: A System Life Cycle Approach',
        version: 'Rev. 2',
        category: 'risk',
        status: 'available',
        lastUpdated: '2021',
        controlCount: 7,
        functionsCount: 7,
        categoriesCount: 7,
        requirementsCount: 7,
        applicableCount: 0,
        notApplicableCount: 0,
        notReviewedCount: 7,
      },
      {
        id: cosoErmId,
        slug: 'coso-erm',
        name: 'COSO Enterprise Risk Management',
        description:
          'Enterprise Risk Management — Integrating with Strategy and Performance (20 Principles)',
        version: '2017',
        category: 'risk',
        status: 'available',
        lastUpdated: '2017',
        controlCount: 20,
        functionsCount: 5,
        categoriesCount: 5,
        requirementsCount: 20,
        applicableCount: 0,
        notApplicableCount: 0,
        notReviewedCount: 20,
      },
      {
        id: csaCcmId,
        slug: 'csa-ccm',
        name: 'CSA Cloud Controls Matrix (CCM v4)',
        description:
          'Cloud Security Alliance cybersecurity control framework for cloud computing across 17 domains',
        version: 'v4.0',
        category: 'cloud',
        status: 'available',
        lastUpdated: '2023',
        controlCount: 197,
        functionsCount: 17,
        categoriesCount: 17,
        requirementsCount: 197,
        applicableCount: 0,
        notApplicableCount: 0,
        notReviewedCount: 197,
      },
      {
        id: iso27017Id,
        slug: 'iso27017',
        name: 'ISO/IEC 27017:2015',
        description:
          'Code of practice for information security controls based on ISO/IEC 27002 for cloud services',
        version: '2015',
        category: 'cloud',
        status: 'available',
        lastUpdated: '2015',
        controlCount: 37,
        functionsCount: 7,
        categoriesCount: 7,
        requirementsCount: 37,
        applicableCount: 0,
        notApplicableCount: 0,
        notReviewedCount: 37,
      },
      {
        id: hipaaId,
        slug: 'hipaa',
        name: 'HIPAA Security & Privacy Rule',
        description:
          'Health Insurance Portability and Accountability Act national standards for protecting ePHI',
        version: '2013',
        category: 'regulatory',
        status: 'available',
        lastUpdated: '2023',
        controlCount: 74,
        functionsCount: 4,
        categoriesCount: 8,
        requirementsCount: 74,
        applicableCount: 0,
        notApplicableCount: 0,
        notReviewedCount: 74,
      },
    ];

    for (const fw of defaultFrameworks) {
      this.frameworks.set(fw.id, fw);
    }

    // NIST CSF 2.0 full hierarchy requirements
    const nistReqs: FrameworkRequirement[] = [
      // GOVERN (GV)
      {
        id: 'nist-gv-oc-01',
        frameworkId: nistId,
        code: 'GV.OC-01',
        title: 'Organizational Context & Mission Understanding',
        description:
          'The organizational context, mission, and stakeholder expectations regarding cybersecurity are understood and integrated.',
        functionCode: 'GV',
        functionName: 'GOVERN',
        categoryCode: 'GV.OC',
        categoryName: 'Organizational Context',
        guidance:
          'Document the organization mission, external obligations, and internal dependencies. Review periodically.',
        references: ['NIST SP 800-53 Rev. 5: PM-11', 'ISO/IEC 27001:2022: 4.1'],
        applicability: 'applicable',
        applicabilityRationale: 'Essential for defining enterprise cybersecurity priorities.',
        scopeBusinessUnits: ['Enterprise IT', 'Corporate Security', 'Executive Office'],
        scopeSystems: ['Corporate Intranet', 'ERP System'],
        scopeLocations: ['US-East', 'EU-Central'],
        scopeLegalEntities: ['Acme Global Inc.'],
        implementationStatus: 'implemented',
        implementationDescription:
          'Corporate security charter and annual mission context alignment review conducted in Q1.',
        controlOwner: 'Security Governance',
        controlOperator: 'CISO Office',
        reviewFrequency: 'Annual',
        lastAssessed: '2026-08-15',
        nextAssessment: '2027-02-15',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
      {
        id: 'nist-gv-oc-02',
        frameworkId: nistId,
        code: 'GV.OC-02',
        title: 'Legal, Regulatory, and Contractual Requirements',
        description:
          'Legal, regulatory, and contractual requirements regarding cybersecurity, including privacy obligations, are understood and managed.',
        functionCode: 'GV',
        functionName: 'GOVERN',
        categoryCode: 'GV.OC',
        categoryName: 'Organizational Context',
        guidance:
          'Maintain a compliance registry of all applicable laws, regulations, and industry contracts.',
        references: ['NIST SP 800-53 Rev. 5: PM-1', 'ISO/IEC 27001:2022: A.5.31'],
        applicability: 'applicable',
        applicabilityRationale: 'Subject to SEC cyber disclosure, GDPR, and SOC 2 requirements.',
        scopeBusinessUnits: ['Legal & Compliance', 'Corporate Security'],
        scopeSystems: ['Compliance Portal'],
        scopeLocations: ['Global'],
        scopeLegalEntities: ['Acme Global Inc.', 'Acme EU Ltd.'],
        implementationStatus: 'implemented',
        implementationDescription:
          'Centralized regulatory matrix maintained with quarterly legal counsel sync.',
        controlOwner: 'Legal & Compliance',
        controlOperator: 'Compliance Officer',
        reviewFrequency: 'Quarterly',
        lastAssessed: '2026-07-20',
        nextAssessment: '2026-10-20',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
      {
        id: 'nist-gv-rm-01',
        frameworkId: nistId,
        code: 'GV.RM-01',
        title: 'Risk Management Strategy & Objectives',
        description:
          'Risk management objectives are established and agreed to by organizational stakeholders.',
        functionCode: 'GV',
        functionName: 'GOVERN',
        categoryCode: 'GV.RM',
        categoryName: 'Risk Management Strategy',
        guidance:
          'Formulate risk appetite and tolerance thresholds approved by the Risk Committee.',
        references: ['NIST SP 800-53 Rev. 5: PM-9', 'ISO/IEC 27001:2022: 6.1.2'],
        applicability: 'applicable',
        applicabilityRationale: 'Foundational for all risk-based decision making across systems.',
        scopeBusinessUnits: ['All Business Units'],
        scopeSystems: ['All Systems'],
        scopeLocations: ['All Locations'],
        scopeLegalEntities: ['All Legal Entities'],
        implementationStatus: 'implemented',
        implementationDescription:
          'Enterprise risk management framework defined with 5x5 likelihood-impact matrix.',
        controlOwner: 'Enterprise Risk Management',
        controlOperator: 'Risk Committee',
        reviewFrequency: 'Annual',
        lastAssessed: '2026-06-10',
        nextAssessment: '2027-06-10',
        evidenceCount: 3,
        mappedControlsCount: 3,
        openFindingsCount: 0,
      },
      {
        id: 'nist-gv-rr-01',
        frameworkId: nistId,
        code: 'GV.RR-01',
        title: 'Roles, Responsibilities, and Authorities',
        description:
          'Executive leadership is responsible and accountable for cybersecurity risk, and roles across the organization are defined and communicated.',
        functionCode: 'GV',
        functionName: 'GOVERN',
        categoryCode: 'GV.RR',
        categoryName: 'Roles, Responsibilities and Authorities',
        guidance:
          'Establish RACI charts for security processes and ensure board oversight of cybersecurity.',
        references: ['NIST SP 800-53 Rev. 5: PL-4', 'ISO/IEC 27001:2022: 5.3'],
        applicability: 'applicable',
        applicabilityRationale: 'Executive oversight required for governance structure.',
        scopeBusinessUnits: ['Executive Board', 'Corporate Security'],
        scopeSystems: ['HR Information System'],
        scopeLocations: ['Headquarters'],
        scopeLegalEntities: ['Acme Global Inc.'],
        implementationStatus: 'implemented',
        implementationDescription:
          'CISO reports quarterly to Audit Committee; job descriptions include security duties.',
        controlOwner: 'Security Governance',
        controlOperator: 'CISO Office',
        reviewFrequency: 'Annual',
        lastAssessed: '2026-05-14',
        nextAssessment: '2027-05-14',
        evidenceCount: 1,
        mappedControlsCount: 1,
        openFindingsCount: 0,
      },
      {
        id: 'nist-gv-po-01',
        frameworkId: nistId,
        code: 'GV.PO-01',
        title: 'Policy Establishment, Communication, and Enforcement',
        description:
          'Policy for managing cybersecurity risks is established based on organizational context, cybersecurity strategy, and priorities and is communicated and enforced.',
        functionCode: 'GV',
        functionName: 'GOVERN',
        categoryCode: 'GV.PO',
        categoryName: 'Policy',
        guidance:
          'Policies must be approved by management, reviewed at planned intervals, published in an accessible policy library, and backed by automated or manual enforcement mechanisms.',
        references: [
          'NIST SP 800-53 Rev. 5: PM-1, PL-1, PS-1',
          'ISO/IEC 27001:2022: A.5.1',
          'COBIT 2019: EDM01.01',
          'CIS Controls v8: 1.1',
        ],
        applicability: 'applicable',
        applicabilityRationale:
          'Mandatory for all corporate, cloud, and third-party security governance.',
        scopeBusinessUnits: [
          'Enterprise IT',
          'Corporate Security',
          'Cloud Engineering',
          'Finance',
          'HR',
        ],
        scopeSystems: ['AWS Production', 'Entra ID', 'GitHub Enterprise', 'Salesforce'],
        scopeLocations: ['US-East (Virginia)', 'EU-Central (Frankfurt)', 'Global Remote'],
        scopeLegalEntities: ['Acme Global Inc.', 'Acme EU Ltd.'],
        implementationStatus: 'partially_implemented',
        implementationDescription:
          'Core security policies are published on intranet with annual employee attestation. Automated policy-as-code enforcement in CI/CD pipeline is currently underway.',
        controlOwner: 'Security Governance',
        controlOperator: 'SecOps Team',
        reviewFrequency: 'Annual',
        lastAssessed: '2026-09-08',
        nextAssessment: '2027-03-08',
        evidenceCount: 3,
        mappedControlsCount: 4,
        openFindingsCount: 1,
      },
      {
        id: 'nist-gv-po-02',
        frameworkId: nistId,
        code: 'GV.PO-02',
        title: 'Policy Review and Maintenance',
        description:
          'Policies are reviewed, updated, and approved following changes to organizational context, risks, or technologies.',
        functionCode: 'GV',
        functionName: 'GOVERN',
        categoryCode: 'GV.PO',
        categoryName: 'Policy',
        guidance:
          'Establish a formal annual review schedule and trigger reviews upon major incidents or tech transitions.',
        references: ['NIST SP 800-53 Rev. 5: PL-1', 'ISO/IEC 27001:2022: A.5.1'],
        applicability: 'applicable',
        applicabilityRationale: 'Required to ensure policies remain aligned with emerging threats.',
        scopeBusinessUnits: ['Corporate Security'],
        scopeSystems: ['Policy Management Portal'],
        scopeLocations: ['Global'],
        scopeLegalEntities: ['All Legal Entities'],
        implementationStatus: 'implemented',
        implementationDescription:
          'Annual policy refresh workflow executed with version history tracking.',
        controlOwner: 'Security Governance',
        controlOperator: 'Compliance Team',
        reviewFrequency: 'Annual',
        lastAssessed: '2026-08-01',
        nextAssessment: '2027-08-01',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
      {
        id: 'nist-gv-ov-01',
        frameworkId: nistId,
        code: 'GV.OV-01',
        title: 'Cybersecurity Risk Oversight & Metrics',
        description:
          'Cybersecurity risk management strategy outcomes are reviewed to inform and adjust the strategy and priorities.',
        functionCode: 'GV',
        functionName: 'GOVERN',
        categoryCode: 'GV.OV',
        categoryName: 'Oversight',
        guidance:
          'Report quarterly Key Risk Indicators (KRIs) and Key Performance Indicators (KPIs) to leadership.',
        references: ['NIST SP 800-53 Rev. 5: PM-6', 'ISO/IEC 27001:2022: 9.3'],
        applicability: 'applicable',
        applicabilityRationale: 'Ensures executive team has visibility into residual risk.',
        scopeBusinessUnits: ['Executive Board', 'Corporate Security'],
        scopeSystems: ['Executive Dashboard'],
        scopeLocations: ['Headquarters'],
        scopeLegalEntities: ['Acme Global Inc.'],
        implementationStatus: 'implemented',
        implementationDescription:
          'Monthly metrics package and quarterly board decks prepared and reviewed.',
        controlOwner: 'Security Governance',
        controlOperator: 'CISO Office',
        reviewFrequency: 'Quarterly',
        lastAssessed: '2026-07-15',
        nextAssessment: '2026-10-15',
        evidenceCount: 1,
        mappedControlsCount: 1,
        openFindingsCount: 0,
      },
      {
        id: 'nist-gv-sc-01',
        frameworkId: nistId,
        code: 'GV.SC-01',
        title: 'Supply Chain Risk Management Strategy',
        description:
          'A cybersecurity supply chain risk management program, strategy, objectives, policies, and processes are established and integrated.',
        functionCode: 'GV',
        functionName: 'GOVERN',
        categoryCode: 'GV.SC',
        categoryName: 'Cybersecurity Supply Chain Risk Management',
        guidance:
          'Classify suppliers by critical tiering and conduct pre-contract security assessments.',
        references: ['NIST SP 800-53 Rev. 5: SR-1', 'ISO/IEC 27001:2022: A.5.19'],
        applicability: 'applicable',
        applicabilityRationale: 'Third-party SaaS and cloud vendors process customer data.',
        scopeBusinessUnits: ['Procurement', 'Vendor Risk Management', 'Cloud SecOps'],
        scopeSystems: ['Vendor Assessment Portal'],
        scopeLocations: ['Global'],
        scopeLegalEntities: ['Acme Global Inc.'],
        implementationStatus: 'partially_implemented',
        implementationDescription:
          'Vendor onboarding questionnaires are required; annual reassessments are currently being automated.',
        controlOwner: 'Vendor Risk Management',
        controlOperator: 'Procurement & Security',
        reviewFrequency: 'Annual',
        lastAssessed: '2026-06-01',
        nextAssessment: '2026-12-01',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },

      // IDENTIFY (ID)
      {
        id: 'nist-id-am-01',
        frameworkId: nistId,
        code: 'ID.AM-01',
        title: 'Hardware Asset Inventory',
        description:
          'Inventories of hardware managed by the organization are maintained and kept up to date.',
        functionCode: 'ID',
        functionName: 'IDENTIFY',
        categoryCode: 'ID.AM',
        categoryName: 'Asset Management',
        guidance:
          'Maintain an automated CMDB discovery mechanism for laptops, servers, and network devices.',
        references: ['NIST SP 800-53 Rev. 5: CM-8', 'ISO/IEC 27001:2022: A.8.1'],
        applicability: 'applicable',
        applicabilityRationale:
          'Required for hardware vulnerability tracking and endpoint defense.',
        scopeBusinessUnits: ['Enterprise IT', 'SecOps'],
        scopeSystems: ['MDM / Intune', 'CMDB'],
        scopeLocations: ['All Offices', 'Data Centers'],
        scopeLegalEntities: ['Acme Global Inc.'],
        implementationStatus: 'implemented',
        implementationDescription:
          'Automated endpoint discovery via Microsoft Intune and AWS Systems Manager.',
        controlOwner: 'IT Infrastructure',
        controlOperator: 'Endpoint Admin',
        reviewFrequency: 'Continuous',
        lastAssessed: '2026-08-30',
        nextAssessment: '2026-11-30',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
      {
        id: 'nist-id-am-02',
        frameworkId: nistId,
        code: 'ID.AM-02',
        title: 'Software, Services, and Systems Inventory',
        description:
          'Inventories of software, services, and systems managed by the organization are maintained.',
        functionCode: 'ID',
        functionName: 'IDENTIFY',
        categoryCode: 'ID.AM',
        categoryName: 'Asset Management',
        guidance:
          'Track approved software catalogs, container images, and external SaaS subscriptions.',
        references: ['NIST SP 800-53 Rev. 5: CM-8', 'ISO/IEC 27001:2022: A.8.1'],
        applicability: 'applicable',
        applicabilityRationale: 'Required to prevent shadow IT and vulnerable dependencies.',
        scopeBusinessUnits: ['Software Engineering', 'Enterprise IT'],
        scopeSystems: ['GitHub Enterprise', 'AWS CloudFormation'],
        scopeLocations: ['Cloud Regions'],
        scopeLegalEntities: ['Acme Global Inc.'],
        implementationStatus: 'implemented',
        implementationDescription:
          'GitHub Dependabot, Snyk, and AWS Config automated asset inventory tracking.',
        controlOwner: 'DevOps & Reliability',
        controlOperator: 'Cloud SecOps',
        reviewFrequency: 'Continuous',
        lastAssessed: '2026-08-25',
        nextAssessment: '2026-11-25',
        evidenceCount: 2,
        mappedControlsCount: 3,
        openFindingsCount: 0,
      },
      {
        id: 'nist-id-ra-01',
        frameworkId: nistId,
        code: 'ID.RA-01',
        title: 'Vulnerability Identification & Management',
        description:
          'Vulnerabilities in assets are identified, validated, and recorded across infrastructure and applications.',
        functionCode: 'ID',
        functionName: 'IDENTIFY',
        categoryCode: 'ID.RA',
        categoryName: 'Risk Assessment',
        guidance:
          'Conduct continuous SAST/DAST scans, weekly infrastructure vulnerability scans, and external penetration tests.',
        references: ['NIST SP 800-53 Rev. 5: RA-5', 'ISO/IEC 27001:2022: A.12.6.1'],
        applicability: 'applicable',
        applicabilityRationale: 'Critical for proactive exposure management.',
        scopeBusinessUnits: ['Cloud Engineering', 'SecOps'],
        scopeSystems: ['AWS Production', 'Kubernetes Clusters'],
        scopeLocations: ['US-East', 'EU-Central'],
        scopeLegalEntities: ['Acme Global Inc.'],
        implementationStatus: 'implemented',
        implementationDescription:
          'Automated Qualys & AWS Inspector daily scans with SLA enforcement: Critical within 7d, High within 30d.',
        controlOwner: 'Cloud Security',
        controlOperator: 'SecOps Team',
        reviewFrequency: 'Continuous',
        lastAssessed: '2026-09-01',
        nextAssessment: '2026-12-01',
        evidenceCount: 3,
        mappedControlsCount: 3,
        openFindingsCount: 0,
      },

      // PROTECT (PR)
      {
        id: 'nist-pr-aa-01',
        frameworkId: nistId,
        code: 'PR.AA-01',
        title: 'Identity Management & Authentication',
        description:
          'Identities and credentials for authorized users, services, and hardware are managed and authenticated.',
        functionCode: 'PR',
        functionName: 'PROTECT',
        categoryCode: 'PR.AA',
        categoryName: 'Identity Management, Authentication, and Access Control',
        guidance:
          'Enforce multi-factor authentication (MFA) for all users and automated identity lifecycle provisioning.',
        references: [
          'ISO/IEC 27001:2022: A.5.15, A.9.4.2',
          'AICPA TSC (SOC 2): CC6.1',
          'CIS Controls v8: 6.5',
          'PCI DSS v4.0.1: 8.3',
          'NIST SP 800-53 Rev. 5: AC-2, IA-2',
        ],
        crossFrameworkMappings: [
          {
            targetFrameworkId: isoId,
            targetFrameworkName: 'ISO/IEC 27001:2022',
            targetRequirementCode: 'A.5.15',
            targetRequirementTitle: 'Access Control',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: soc2Id,
            targetFrameworkName: 'AICPA Trust Services Criteria (TSC)',
            targetRequirementCode: 'CC6.1',
            targetRequirementTitle: 'Logical Access Security',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: cisId,
            targetFrameworkName: 'CIS Controls v8',
            targetRequirementCode: '6.5',
            targetRequirementTitle: 'Centralize Access Control',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: pciId,
            targetFrameworkName: 'PCI DSS v4.0.1',
            targetRequirementCode: '8.3',
            targetRequirementTitle: 'Multi-Factor Authentication',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: nist80053Id,
            targetFrameworkName: 'NIST SP 800-53 Rev. 5',
            targetRequirementCode: 'IA-2',
            targetRequirementTitle: 'Identification and Authentication',
            mappingType: 'equivalent',
          },
        ],
        applicability: 'applicable',
        applicabilityRationale: 'Primary defense against unauthorized access and account takeover.',
        scopeBusinessUnits: ['All Business Units'],
        scopeSystems: ['Entra ID', 'AWS IAM', 'Okta SSO', 'GitHub Enterprise'],
        scopeLocations: ['Global'],
        scopeLegalEntities: ['All Legal Entities'],
        implementationStatus: 'implemented',
        implementationDescription:
          'Hardware-backed FIDO2 / WebAuthn MFA enforced via Entra ID Conditional Access across all SaaS and cloud environments.',
        controlOwner: 'Identity & Access Team',
        controlOperator: 'Identity Admin',
        reviewFrequency: 'Quarterly',
        lastAssessed: '2026-09-05',
        nextAssessment: '2026-12-05',
        evidenceCount: 4,
        mappedControlsCount: 4,
        openFindingsCount: 0,
      },
      {
        id: 'nist-pr-aa-02',
        frameworkId: nistId,
        code: 'PR.AA-02',
        title: 'Access Permissions & Principle of Least Privilege',
        description:
          'Access permissions, entitlements, and authorizations are managed incorporating the principle of least privilege.',
        functionCode: 'PR',
        functionName: 'PROTECT',
        categoryCode: 'PR.AA',
        categoryName: 'Identity Management, Authentication, and Access Control',
        guidance:
          'Conduct quarterly user access reviews and utilize role-based access control (RBAC).',
        references: [
          'ISO/IEC 27001:2022: A.5.18, A.9.2.3',
          'AICPA TSC (SOC 2): CC6.2, CC6.3',
          'CIS Controls v8: 5.4, 6.1',
          'PCI DSS v4.0.1: 7.1, 7.2',
          'NIST SP 800-53 Rev. 5: AC-6',
        ],
        crossFrameworkMappings: [
          {
            targetFrameworkId: isoId,
            targetFrameworkName: 'ISO/IEC 27001:2022',
            targetRequirementCode: 'A.5.18',
            targetRequirementTitle: 'Access Rights Management',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: soc2Id,
            targetFrameworkName: 'AICPA Trust Services Criteria (TSC)',
            targetRequirementCode: 'CC6.2',
            targetRequirementTitle: 'User Registration & Access Rights',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: cisId,
            targetFrameworkName: 'CIS Controls v8',
            targetRequirementCode: '5.4',
            targetRequirementTitle: 'Restrict Administrator Privileges',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: pciId,
            targetFrameworkName: 'PCI DSS v4.0.1',
            targetRequirementCode: '7.1',
            targetRequirementTitle: 'Limit Access to System Components',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: nist80053Id,
            targetFrameworkName: 'NIST SP 800-53 Rev. 5',
            targetRequirementCode: 'AC-6',
            targetRequirementTitle: 'Least Privilege',
            mappingType: 'equivalent',
          },
        ],
        applicability: 'applicable',
        applicabilityRationale: 'Limits blast radius of credential compromise.',
        scopeBusinessUnits: ['Enterprise IT', 'Cloud Engineering'],
        scopeSystems: ['AWS IAM', 'Entra ID', 'Database Clusters'],
        scopeLocations: ['Global'],
        scopeLegalEntities: ['Acme Global Inc.'],
        implementationStatus: 'partially_implemented',
        implementationDescription:
          'RBAC implemented across all cloud roles; quarterly access reviews completed for production systems.',
        controlOwner: 'Identity & Access Team',
        controlOperator: 'SecOps Team',
        reviewFrequency: 'Quarterly',
        lastAssessed: '2026-09-08',
        nextAssessment: '2026-12-08',
        evidenceCount: 2,
        mappedControlsCount: 3,
        openFindingsCount: 1,
      },
      {
        id: 'nist-pr-aa-03',
        frameworkId: nistId,
        code: 'PR.AA-03',
        title: 'Access Credentials Issuance, Management, Revocation & Authentication',
        description:
          'Access credentials are issued, managed, revoked, and authenticated for authorized personnel and services, incorporating privileged access management.',
        functionCode: 'PR',
        functionName: 'PROTECT',
        categoryCode: 'PR.AA',
        categoryName: 'Identity Management, Authentication, and Access Control',
        guidance:
          'Enforce centralized privileged access management (PAM), just-in-time access elevation, ephemeral credential rotation, hardware MFA, and automated revocation workflows upon role change or termination.',
        references: [
          'ISO/IEC 27001:2022: A.5.15, A.5.18, A.8.5',
          'AICPA TSC (SOC 2): CC6.1, CC6.2, CC6.3',
          'CIS Controls v8: 5.4, 6.5, 6.8',
          'PCI DSS v4.0.1: 7.1, 8.2, 8.3',
          'NIST SP 800-53 Rev. 5: AC-2, AC-3, AC-6, IA-2',
        ],
        crossFrameworkMappings: [
          {
            targetFrameworkId: isoId,
            targetFrameworkName: 'ISO/IEC 27001:2022',
            targetRequirementCode: 'A.5.15',
            targetRequirementTitle: 'Access Control',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: isoId,
            targetFrameworkName: 'ISO/IEC 27001:2022',
            targetRequirementCode: 'A.5.18',
            targetRequirementTitle: 'Access Rights',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: isoId,
            targetFrameworkName: 'ISO/IEC 27001:2022',
            targetRequirementCode: 'A.8.5',
            targetRequirementTitle: 'Secure Authentication',
            mappingType: 'superset',
          },
          {
            targetFrameworkId: soc2Id,
            targetFrameworkName: 'AICPA Trust Services Criteria (TSC)',
            targetRequirementCode: 'CC6.1',
            targetRequirementTitle: 'Logical Access Security',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: soc2Id,
            targetFrameworkName: 'AICPA Trust Services Criteria (TSC)',
            targetRequirementCode: 'CC6.3',
            targetRequirementTitle: 'Role-based & Privileged Access Control',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: cisId,
            targetFrameworkName: 'CIS Controls v8',
            targetRequirementCode: '5.4',
            targetRequirementTitle: 'Restrict Administrator Privileges',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: cisId,
            targetFrameworkName: 'CIS Controls v8',
            targetRequirementCode: '6.5',
            targetRequirementTitle: 'Centralize Access Control',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: cisId,
            targetFrameworkName: 'CIS Controls v8',
            targetRequirementCode: '6.8',
            targetRequirementTitle: 'Use Separate Privileged Accounts',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: pciId,
            targetFrameworkName: 'PCI DSS v4.0.1',
            targetRequirementCode: '7.1',
            targetRequirementTitle: 'Limit Access to System Components',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: pciId,
            targetFrameworkName: 'PCI DSS v4.0.1',
            targetRequirementCode: '8.3',
            targetRequirementTitle: 'Strong Authentication & MFA for Privileged Access',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: nist80053Id,
            targetFrameworkName: 'NIST SP 800-53 Rev. 5',
            targetRequirementCode: 'AC-2',
            targetRequirementTitle: 'Account Management',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: nist80053Id,
            targetFrameworkName: 'NIST SP 800-53 Rev. 5',
            targetRequirementCode: 'AC-6',
            targetRequirementTitle: 'Least Privilege',
            mappingType: 'equivalent',
          },
        ],
        applicability: 'applicable',
        applicabilityRationale:
          'Mandatory for all corporate, cloud console, database, and infrastructure administrative access.',
        scopeBusinessUnits: ['All Engineering', 'SecOps', 'IT Operations'],
        scopeSystems: [
          'AWS IAM',
          'Teleport PAM',
          'Okta SSO',
          'GitHub Enterprise',
          'Production Clusters',
        ],
        scopeLocations: ['Global'],
        scopeLegalEntities: ['Acme Global Inc.', 'Acme EU Ltd.'],
        implementationStatus: 'implemented',
        implementationDescription:
          'Teleport PAM gateway integrated with Okta SSO and YubiKey WebAuthn. Just-in-time access requests require dual approval and all root sessions are recorded.',
        controlOwner: 'Identity & Access Architecture',
        controlOperator: 'SecOps Team',
        reviewFrequency: 'Quarterly',
        lastAssessed: '2026-09-10',
        nextAssessment: '2026-12-10',
        evidenceCount: 3,
        mappedControlsCount: 4,
        openFindingsCount: 0,
      },
      {
        id: 'nist-pr-ds-01',
        frameworkId: nistId,
        code: 'PR.DS-01',
        title: 'Data-at-Rest Protection',
        description:
          'The confidentiality, integrity, and availability of data-at-rest are protected using encryption.',
        functionCode: 'PR',
        functionName: 'PROTECT',
        categoryCode: 'PR.DS',
        categoryName: 'Data Security',
        guidance: 'Enforce AES-256 encryption across all databases, object storage, and backups.',
        references: ['NIST SP 800-53 Rev. 5: SC-28', 'ISO/IEC 27001:2022: A.10.1'],
        applicability: 'applicable',
        applicabilityRationale: 'Mandatory for cardholder, health, and personal customer data.',
        scopeBusinessUnits: ['Cloud Engineering', 'DevOps'],
        scopeSystems: ['PostgreSQL DB', 'AWS S3 Buckets', 'EBS Volumes'],
        scopeLocations: ['US-East', 'EU-Central'],
        scopeLegalEntities: ['Acme Global Inc.', 'Acme EU Ltd.'],
        implementationStatus: 'implemented',
        implementationDescription:
          'AWS KMS customer-managed keys (CMK) with annual rotation applied to all RDS and S3 buckets.',
        controlOwner: 'Cloud Security',
        controlOperator: 'DevOps & Reliability',
        reviewFrequency: 'Continuous',
        lastAssessed: '2026-08-10',
        nextAssessment: '2026-11-10',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
      {
        id: 'nist-pr-ds-02',
        frameworkId: nistId,
        code: 'PR.DS-02',
        title: 'Data-in-Transit Protection',
        description:
          'The confidentiality, integrity, and availability of data-in-transit are protected using modern cryptographic protocols.',
        functionCode: 'PR',
        functionName: 'PROTECT',
        categoryCode: 'PR.DS',
        categoryName: 'Data Security',
        guidance: 'Enforce TLS 1.3 across all public and internal service-to-service endpoints.',
        references: ['NIST SP 800-53 Rev. 5: SC-8', 'ISO/IEC 27001:2022: A.10.1'],
        applicability: 'applicable',
        applicabilityRationale: 'Protects communication from interception and spoofing.',
        scopeBusinessUnits: ['Cloud Engineering'],
        scopeSystems: ['API Gateway', 'Load Balancers', 'mTLS Mesh'],
        scopeLocations: ['Global'],
        scopeLegalEntities: ['Acme Global Inc.'],
        implementationStatus: 'implemented',
        implementationDescription:
          'Strict TLS 1.3 enforced on Cloudflare Edge and Linkerd service mesh in Kubernetes.',
        controlOwner: 'Cloud Security',
        controlOperator: 'DevOps & Reliability',
        reviewFrequency: 'Continuous',
        lastAssessed: '2026-08-12',
        nextAssessment: '2026-11-12',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },

      // DETECT (DE)
      {
        id: 'nist-de-ae-02',
        frameworkId: nistId,
        code: 'DE.AE-02',
        title: 'Adverse Event & Anomalies Analysis',
        description:
          'Potential cybersecurity events and anomalies are analyzed to understand attack targets and methods.',
        functionCode: 'DE',
        functionName: 'DETECT',
        categoryCode: 'DE.AE',
        categoryName: 'Adverse Event Analysis',
        guidance:
          'Implement automated SIEM correlations with threat intelligence feeds and alert triaging.',
        references: ['NIST SP 800-53 Rev. 5: SI-4', 'ISO/IEC 27001:2022: A.12.4.1'],
        applicability: 'applicable',
        applicabilityRationale: 'Enables rapid containment before incidents escalate.',
        scopeBusinessUnits: ['Corporate Security', 'SecOps'],
        scopeSystems: ['Datadog SIEM', 'AWS CloudTrail', 'GuardDuty'],
        scopeLocations: ['Global'],
        scopeLegalEntities: ['Acme Global Inc.'],
        implementationStatus: 'implemented',
        implementationDescription:
          'Centralized Datadog Security Monitoring with 24/7 on-call alerting for high/critical security signals.',
        controlOwner: 'SecOps & Infrastructure',
        controlOperator: 'SOC Team',
        reviewFrequency: 'Continuous',
        lastAssessed: '2026-09-02',
        nextAssessment: '2026-12-02',
        evidenceCount: 3,
        mappedControlsCount: 3,
        openFindingsCount: 0,
      },
      {
        id: 'nist-de-cm-01',
        frameworkId: nistId,
        code: 'DE.CM-01',
        title: 'Continuous Security Monitoring',
        description:
          'Networks, computing environments, and personnel activities are monitored to detect potential cybersecurity events.',
        functionCode: 'DE',
        functionName: 'DETECT',
        categoryCode: 'DE.CM',
        categoryName: 'Continuous Monitoring',
        guidance:
          'Ensure 100% telemetry coverage across endpoints, network perimeters, and cloud control planes.',
        references: ['NIST SP 800-53 Rev. 5: CA-7', 'ISO/IEC 27001:2022: A.12.4.1'],
        applicability: 'applicable',
        applicabilityRationale: 'Required for real-time threat detection.',
        scopeBusinessUnits: ['SecOps', 'Cloud Engineering'],
        scopeSystems: ['CrowdStrike Falcon', 'AWS VPC Flow Logs'],
        scopeLocations: ['All Workstations', 'Cloud Regions'],
        scopeLegalEntities: ['Acme Global Inc.'],
        implementationStatus: 'implemented',
        implementationDescription:
          'CrowdStrike EDR installed on 100% of managed workstations and production nodes.',
        controlOwner: 'SecOps & Infrastructure',
        controlOperator: 'SecOps Team',
        reviewFrequency: 'Continuous',
        lastAssessed: '2026-09-03',
        nextAssessment: '2026-12-03',
        evidenceCount: 3,
        mappedControlsCount: 3,
        openFindingsCount: 0,
      },

      // RESPOND (RS)
      {
        id: 'nist-rs-ma-01',
        frameworkId: nistId,
        code: 'RS.MA-01',
        title: 'Incident Management Plan Execution',
        description:
          'Incident management processes are established, tested, and executed when an incident is detected.',
        functionCode: 'RS',
        functionName: 'RESPOND',
        categoryCode: 'RS.MA',
        categoryName: 'Incident Management',
        guidance:
          'Maintain tested playbooks for ransomware, data exfiltration, and credential leaks.',
        references: ['NIST SP 800-53 Rev. 5: IR-4', 'ISO/IEC 27001:2022: A.16.1.1'],
        applicability: 'applicable',
        applicabilityRationale: 'Ensures structured, compliant handling of cybersecurity events.',
        scopeBusinessUnits: ['Corporate Security', 'Legal', 'Communications'],
        scopeSystems: ['Incident Commander Tool', 'PagerDuty'],
        scopeLocations: ['Global'],
        scopeLegalEntities: ['Acme Global Inc.', 'Acme EU Ltd.'],
        implementationStatus: 'implemented',
        implementationDescription:
          'Incident response runbook updated semi-annually with tabletop exercises completed in May 2026.',
        controlOwner: 'Corporate Security',
        controlOperator: 'Incident Commander Team',
        reviewFrequency: 'Semi-Annual',
        lastAssessed: '2026-05-20',
        nextAssessment: '2026-11-20',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },

      // RECOVER (RC)
      {
        id: 'nist-rc-rp-01',
        frameworkId: nistId,
        code: 'RC.RP-01',
        title: 'Incident Recovery Plan Execution',
        description:
          'Recovery plan is executed during or after a cybersecurity incident to restore systems and data integrity.',
        functionCode: 'RC',
        functionName: 'RECOVER',
        categoryCode: 'RC.RP',
        categoryName: 'Incident Recovery Plan Execution',
        guidance:
          'Maintain automated immutable backups and conduct annual disaster recovery failover tests.',
        references: ['NIST SP 800-53 Rev. 5: CP-2', 'ISO/IEC 27001:2022: A.17.1.1'],
        applicability: 'applicable',
        applicabilityRationale: 'Protects business continuity and satisfies RPO/RTO SLAs.',
        scopeBusinessUnits: ['DevOps & Reliability', 'IT Operations'],
        scopeSystems: ['AWS Backup Vault', 'Database Replicas'],
        scopeLocations: ['US-East', 'US-West'],
        scopeLegalEntities: ['Acme Global Inc.'],
        implementationStatus: 'implemented',
        implementationDescription:
          'Cross-region automated daily snapshot replication with 30-day retention and tested quarterly restore drills.',
        controlOwner: 'DevOps & Reliability',
        controlOperator: 'Site Reliability Team',
        reviewFrequency: 'Quarterly',
        lastAssessed: '2026-08-18',
        nextAssessment: '2026-11-18',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
    ];

    this.requirements.set(nistId, nistReqs);

    // AICPA Trust Services Criteria (TSC) requirements
    const soc2Reqs: FrameworkRequirement[] = [
      {
        id: 'soc2-cc1-1',
        frameworkId: soc2Id,
        code: 'CC1.1',
        title: 'Integrity and Ethical Values (COSO Principle 1)',
        description:
          'The entity demonstrates a commitment to integrity and ethical values across management and staff.',
        functionCode: 'CC1',
        functionName: 'Control Environment',
        categoryCode: 'CC1',
        categoryName: 'Control Environment',
        guidance: 'Maintain written code of conduct and annual employee compliance sign-off.',
        references: ['COSO 2013: Principle 1', 'NIST CSF 2.0: GV.PO-01'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 1,
        mappedControlsCount: 1,
        openFindingsCount: 0,
        crossFrameworkMappings: [
          {
            targetFrameworkId: nistId,
            targetFrameworkName: 'NIST CSF 2.0',
            targetRequirementCode: 'GV.PO-01',
            targetRequirementTitle: 'Policy Establishment & Communication',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: isoId,
            targetFrameworkName: 'ISO/IEC 27001:2022',
            targetRequirementCode: 'A.5.1',
            targetRequirementTitle: 'Policies for Information Security',
            mappingType: 'equivalent',
          },
        ],
      },
      {
        id: 'soc2-cc6-1',
        frameworkId: soc2Id,
        code: 'CC6.1',
        title: 'Logical Access Security & Authentication',
        description:
          'The entity implements logical access security software, infrastructure, and architectures over protected information assets.',
        functionCode: 'CC6',
        functionName: 'Logical and Physical Access Controls',
        categoryCode: 'CC6',
        categoryName: 'Logical Access',
        guidance: 'Enforce strong authentication, MFA, and access control point defense.',
        references: ['NIST CSF 2.0: PR.AA-01', 'ISO/IEC 27001:2022: A.5.15', 'PCI DSS: 8.3'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 3,
        mappedControlsCount: 3,
        openFindingsCount: 0,
        crossFrameworkMappings: [
          {
            targetFrameworkId: nistId,
            targetFrameworkName: 'NIST CSF 2.0',
            targetRequirementCode: 'PR.AA-01',
            targetRequirementTitle: 'Identity Management & Authentication',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: isoId,
            targetFrameworkName: 'ISO/IEC 27001:2022',
            targetRequirementCode: 'A.5.15',
            targetRequirementTitle: 'Access Control',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: cisId,
            targetFrameworkName: 'CIS Controls v8',
            targetRequirementCode: '6.5',
            targetRequirementTitle: 'Centralize Access Control',
            mappingType: 'equivalent',
          },
        ],
      },
      {
        id: 'soc2-cc6-2',
        frameworkId: soc2Id,
        code: 'CC6.2',
        title: 'User Registration & Access Rights Authorization',
        description:
          'Prior to issuing system credentials and granting system access, the entity registers and authorizes new internal and external users.',
        functionCode: 'CC6',
        functionName: 'Logical and Physical Access Controls',
        categoryCode: 'CC6',
        categoryName: 'Logical Access',
        guidance: 'Role-based access provisioning integrated with HR onboarding/offboarding.',
        references: ['NIST CSF 2.0: PR.AA-02', 'ISO/IEC 27001:2022: A.5.18'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
        crossFrameworkMappings: [
          {
            targetFrameworkId: nistId,
            targetFrameworkName: 'NIST CSF 2.0',
            targetRequirementCode: 'PR.AA-02',
            targetRequirementTitle: 'Access Permissions Management',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: isoId,
            targetFrameworkName: 'ISO/IEC 27001:2022',
            targetRequirementCode: 'A.5.18',
            targetRequirementTitle: 'Access Rights Management',
            mappingType: 'equivalent',
          },
        ],
      },
      {
        id: 'soc2-cc6-3',
        frameworkId: soc2Id,
        code: 'CC6.3',
        title: 'Role-Based & Privileged Access Control',
        description:
          'The entity authorizes, modifies, or removes access to data, software, functions, and other protected information assets based on roles and least privilege.',
        functionCode: 'CC6',
        functionName: 'Logical and Physical Access Controls',
        categoryCode: 'CC6',
        categoryName: 'Logical Access',
        guidance:
          'Enforce PAM just-in-time elevation and immediate credential revocation upon termination.',
        references: [
          'NIST CSF 2.0: PR.AA-03',
          'ISO/IEC 27001:2022: A.5.18',
          'CIS Controls v8: 5.4, 6.8',
        ],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 3,
        mappedControlsCount: 2,
        openFindingsCount: 0,
        crossFrameworkMappings: [
          {
            targetFrameworkId: nistId,
            targetFrameworkName: 'NIST CSF 2.0',
            targetRequirementCode: 'PR.AA-03',
            targetRequirementTitle: 'Access Credentials Issuance & Revocation',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: isoId,
            targetFrameworkName: 'ISO/IEC 27001:2022',
            targetRequirementCode: 'A.5.18',
            targetRequirementTitle: 'Access Rights Management',
            mappingType: 'equivalent',
          },
          {
            targetFrameworkId: cisId,
            targetFrameworkName: 'CIS Controls v8',
            targetRequirementCode: '6.8',
            targetRequirementTitle: 'Use Separate Privileged Accounts',
            mappingType: 'equivalent',
          },
        ],
      },
      {
        id: 'soc2-cc7-2',
        frameworkId: soc2Id,
        code: 'CC7.2',
        title: 'Security Event Monitoring & Anomaly Detection',
        description:
          'The entity monitors system components and the operation of controls to detect anomalies and potential security incidents.',
        functionCode: 'CC7',
        functionName: 'System Operations',
        categoryCode: 'CC7',
        categoryName: 'Monitoring & Incident Response',
        guidance: 'Centralized SIEM alerting and 24/7 incident response SLA.',
        references: ['NIST CSF 2.0: DE.AE-02', 'ISO/IEC 27001:2022: A.8.16'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
        crossFrameworkMappings: [
          {
            targetFrameworkId: nistId,
            targetFrameworkName: 'NIST CSF 2.0',
            targetRequirementCode: 'DE.AE-02',
            targetRequirementTitle: 'Event and Alert Analysis',
            mappingType: 'equivalent',
          },
        ],
      },
      {
        id: 'soc2-cc8-1',
        frameworkId: soc2Id,
        code: 'CC8.1',
        title: 'Change Management & Authorization',
        description:
          'The entity authorizes, designs, develops or acquires, configures, documents, tests, approves, and implements changes to infrastructure, data, software, and procedures.',
        functionCode: 'CC8',
        functionName: 'Change Management',
        categoryCode: 'CC8',
        categoryName: 'Change Management',
        guidance: 'Automated CI/CD pipelines, code reviews, and separation of environments.',
        references: ['NIST CSF 2.0: PR.IP-03', 'ISO/IEC 27001:2022: A.8.32'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
    ];
    this.requirements.set(soc2Id, soc2Reqs);

    // ISO/IEC 27001:2022 sample requirements
    const isoReqs: FrameworkRequirement[] = [
      {
        id: 'iso-a5-1',
        frameworkId: isoId,
        code: 'A.5.1',
        title: 'Policies for Information Security',
        description:
          'Information security policy and topic-specific policies shall be defined, approved by management, published, communicated to and acknowledged by relevant personnel.',
        functionCode: 'A.5',
        functionName: 'Organizational Controls',
        categoryCode: 'A.5',
        categoryName: 'Organizational Controls',
        guidance: 'Annual executive review and intranet publication.',
        references: ['NIST CSF 2.0: GV.PO-01', 'SOC 2: CC1.1'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
      {
        id: 'iso-a5-15',
        frameworkId: isoId,
        code: 'A.5.15',
        title: 'Access Control',
        description:
          'Rules to control physical and logical access to information and other associated assets shall be established and documented based on business and security requirements.',
        functionCode: 'A.5',
        functionName: 'Organizational Controls',
        categoryCode: 'A.5',
        categoryName: 'Organizational Controls',
        guidance: 'Role-based access policy and least privilege enforcement.',
        references: ['NIST CSF 2.0: PR.AA-01', 'PR.AA-03', 'SOC 2: CC6.1'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 3,
        mappedControlsCount: 3,
        openFindingsCount: 0,
      },
      {
        id: 'iso-a5-18',
        frameworkId: isoId,
        code: 'A.5.18',
        title: 'Access Rights Management',
        description:
          'Access rights to information and other associated assets shall be provisioned, reviewed, modified, and removed in accordance with the organization topic-specific policy on access control.',
        functionCode: 'A.5',
        functionName: 'Organizational Controls',
        categoryCode: 'A.5',
        categoryName: 'Organizational Controls',
        guidance: 'Quarterly user access recertifications and PAM implementation.',
        references: ['NIST CSF 2.0: PR.AA-02', 'PR.AA-03', 'SOC 2: CC6.2', 'CC6.3'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 2,
        mappedControlsCount: 3,
        openFindingsCount: 0,
      },
      {
        id: 'iso-a8-5',
        frameworkId: isoId,
        code: 'A.8.5',
        title: 'Secure Authentication',
        description:
          'Secure authentication technologies and procedures shall be implemented based on information access restrictions and the topic-specific policy on access control.',
        functionCode: 'A.8',
        functionName: 'Technological Controls',
        categoryCode: 'A.8',
        categoryName: 'Technological Controls',
        guidance: 'FIDO2 / WebAuthn phishing-resistant MFA.',
        references: ['NIST CSF 2.0: PR.AA-01', 'PR.AA-03', 'PCI DSS: 8.3'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 3,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
    ];
    this.requirements.set(isoId, isoReqs);

    // CIS Controls v8 sample requirements
    const cisReqs: FrameworkRequirement[] = [
      {
        id: 'cis-5-4',
        frameworkId: cisId,
        code: '5.4',
        title: 'Restrict Administrator Privileges to Dedicated Accounts',
        description:
          'Restrict administrator privileges to dedicated administrator accounts on enterprise assets.',
        functionCode: 'CIS-05',
        functionName: 'Account Management',
        categoryCode: 'CIS-05',
        categoryName: 'Account Management',
        references: ['NIST CSF 2.0: PR.AA-02', 'PR.AA-03'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
      {
        id: 'cis-6-5',
        frameworkId: cisId,
        code: '6.5',
        title: 'Centralize Access Control',
        description:
          'Centralize access control for all enterprise assets through a centralized directory service or Single Sign-On (SSO) identity provider.',
        functionCode: 'CIS-06',
        functionName: 'Access Control Management',
        categoryCode: 'CIS-06',
        categoryName: 'Access Control Management',
        references: ['NIST CSF 2.0: PR.AA-01', 'PR.AA-03'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 3,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
      {
        id: 'cis-6-8',
        frameworkId: cisId,
        code: '6.8',
        title: 'Define and Maintain Role-Based Access Control',
        description:
          'Use role-based access control to grant access to enterprise assets based on user job functions.',
        functionCode: 'CIS-06',
        functionName: 'Access Control Management',
        categoryCode: 'CIS-06',
        categoryName: 'Access Control Management',
        references: ['NIST CSF 2.0: PR.AA-03', 'ISO/IEC 27001: A.5.18'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
    ];
    this.requirements.set(cisId, cisReqs);

    // PCI DSS v4.0.1 sample requirements
    const pciReqs: FrameworkRequirement[] = [
      {
        id: 'pci-7-1',
        frameworkId: pciId,
        code: '7.1',
        title: 'Limit Access to System Components and Cardholder Data',
        description:
          'Processes and mechanisms for restricting access to system components and cardholder data are defined and understood.',
        functionCode: 'PCI-07',
        functionName: 'Restrict Access by Need to Know',
        categoryCode: 'PCI-07',
        categoryName: 'Access Control',
        references: ['NIST CSF 2.0: PR.AA-02', 'PR.AA-03'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
      {
        id: 'pci-8-3',
        frameworkId: pciId,
        code: '8.3',
        title: 'Strong Authentication & MFA for All Access into CDE',
        description:
          'Multi-factor authentication (MFA) is established for all access to the cardholder data environment (CDE) and administrative console access.',
        functionCode: 'PCI-08',
        functionName: 'Identify Users and Authenticate Access',
        categoryCode: 'PCI-08',
        categoryName: 'Identification & Authentication',
        references: ['NIST CSF 2.0: PR.AA-01', 'PR.AA-03'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 3,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
    ];
    this.requirements.set(pciId, pciReqs);

    // NIST SP 800-53 Rev. 5 sample requirements
    const nist800Reqs: FrameworkRequirement[] = [
      {
        id: 'nist800-ac-2',
        frameworkId: nist80053Id,
        code: 'AC-2',
        title: 'Account Management',
        description:
          'Manage system accounts including establishment, activation, modification, review, disabling, and removal.',
        functionCode: 'AC',
        functionName: 'Access Control',
        categoryCode: 'AC',
        categoryName: 'Access Control',
        references: ['NIST CSF 2.0: PR.AA-01', 'PR.AA-03', 'ISO 27001: A.5.18'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 3,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
      {
        id: 'nist800-ac-6',
        frameworkId: nist80053Id,
        code: 'AC-6',
        title: 'Least Privilege',
        description:
          'Employ the principle of least privilege, allowing only authorized accesses for users (and processes acting on behalf of users) which are necessary to accomplish assigned tasks.',
        functionCode: 'AC',
        functionName: 'Access Control',
        categoryCode: 'AC',
        categoryName: 'Access Control',
        references: ['NIST CSF 2.0: PR.AA-02', 'PR.AA-03'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 2,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
      {
        id: 'nist800-ia-2',
        frameworkId: nist80053Id,
        code: 'IA-2',
        title: 'Identification and Authentication (Organizational Users)',
        description:
          'Uniquely identify and authenticate organizational users (or processes acting on behalf of organizational users).',
        functionCode: 'IA',
        functionName: 'Identification and Authentication',
        categoryCode: 'IA',
        categoryName: 'Identification & Authentication',
        references: ['NIST CSF 2.0: PR.AA-01', 'PR.AA-03'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 3,
        mappedControlsCount: 2,
        openFindingsCount: 0,
      },
    ];
    this.requirements.set(nist80053Id, nist800Reqs);

    // PIPEDA requirements
    const pipedaReqs: FrameworkRequirement[] = [
      {
        id: 'pipeda-prin-1',
        frameworkId: pipedaId,
        code: 'Principle 1',
        title: 'Accountability & Data Protection Governance',
        description:
          'An organization is responsible for personal information under its control and shall designate an individual or individuals who are accountable for the organization compliance with the principles.',
        functionCode: 'PIPEDA',
        functionName: 'Fair Information Principles',
        categoryCode: 'PIPEDA',
        categoryName: 'Accountability',
        references: ['GDPR: Art. 5, Art. 24', 'ISO 27701: PIMS-7.2.1'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 2,
        mappedControlsCount: 1,
        openFindingsCount: 0,
      },
      {
        id: 'pipeda-prin-7',
        frameworkId: pipedaId,
        code: 'Principle 7',
        title: 'Safeguards for Personal Information',
        description:
          'Personal information shall be protected by security safeguards appropriate to the sensitivity of the information.',
        functionCode: 'PIPEDA',
        functionName: 'Fair Information Principles',
        categoryCode: 'PIPEDA',
        categoryName: 'Safeguards',
        references: ['GDPR: Art. 32', 'NIST CSF 2.0: PR.DS-01'],
        applicability: 'applicable',
        implementationStatus: 'implemented',
        evidenceCount: 2,
        mappedControlsCount: 1,
        openFindingsCount: 0,
      },
    ];
    this.requirements.set(pipedaId, pipedaReqs);

    // Common Internal Controls (Unified Control Framework)
    this.internalControls = [
      {
        id: 'ctrl-iam-004',
        code: 'IAM-004',
        title: 'Privileged Access Management (PAM) & Ephemeral Credentials',
        description:
          'Enforce centralized privileged access management with just-in-time (JIT) access approval, ephemeral credential rotation, hardware-backed MFA, and comprehensive session recording for all administrative sessions.',
        owner: 'Identity & Security Architecture',
        category: 'Identity & Access Management',
        frameworkMappings: [
          {
            frameworkId: nistId,
            frameworkName: 'NIST CSF 2.0',
            requirementCode: 'PR.AA-01',
            requirementTitle: 'Identity Management & Authentication',
          },
          {
            frameworkId: nistId,
            frameworkName: 'NIST CSF 2.0',
            requirementCode: 'PR.AA-03',
            requirementTitle: 'Access Credentials Issuance & Revocation',
          },
          {
            frameworkId: isoId,
            frameworkName: 'ISO/IEC 27001:2022',
            requirementCode: 'A.5.15',
            requirementTitle: 'Access Control',
          },
          {
            frameworkId: isoId,
            frameworkName: 'ISO/IEC 27001:2022',
            requirementCode: 'A.5.18',
            requirementTitle: 'Access Rights Management',
          },
          {
            frameworkId: isoId,
            frameworkName: 'ISO/IEC 27001:2022',
            requirementCode: 'A.8.5',
            requirementTitle: 'Secure Authentication',
          },
          {
            frameworkId: soc2Id,
            frameworkName: 'AICPA Trust Services Criteria (TSC)',
            requirementCode: 'CC6.1',
            requirementTitle: 'Logical Access Security',
          },
          {
            frameworkId: soc2Id,
            frameworkName: 'AICPA Trust Services Criteria (TSC)',
            requirementCode: 'CC6.2',
            requirementTitle: 'User Registration & Access Rights',
          },
          {
            frameworkId: soc2Id,
            frameworkName: 'AICPA Trust Services Criteria (TSC)',
            requirementCode: 'CC6.3',
            requirementTitle: 'Role-based & Privileged Access Control',
          },
          {
            frameworkId: cisId,
            frameworkName: 'CIS Controls v8',
            requirementCode: '5.4',
            requirementTitle: 'Restrict Administrator Privileges',
          },
          {
            frameworkId: cisId,
            frameworkName: 'CIS Controls v8',
            requirementCode: '6.5',
            requirementTitle: 'Centralize Access Control',
          },
          {
            frameworkId: cisId,
            frameworkName: 'CIS Controls v8',
            requirementCode: '6.8',
            requirementTitle: 'Use Separate Privileged Accounts',
          },
          {
            frameworkId: pciId,
            frameworkName: 'PCI DSS v4.0.1',
            requirementCode: '7.1',
            requirementTitle: 'Limit Access to System Components',
          },
          {
            frameworkId: pciId,
            frameworkName: 'PCI DSS v4.0.1',
            requirementCode: '8.2',
            requirementTitle: 'Identify and Authenticate Users',
          },
          {
            frameworkId: pciId,
            frameworkName: 'PCI DSS v4.0.1',
            requirementCode: '8.3',
            requirementTitle: 'Strong Authentication & MFA for Privileged Access',
          },
          {
            frameworkId: nist80053Id,
            frameworkName: 'NIST SP 800-53 Rev. 5',
            requirementCode: 'AC-2',
            requirementTitle: 'Account Management',
          },
          {
            frameworkId: nist80053Id,
            frameworkName: 'NIST SP 800-53 Rev. 5',
            requirementCode: 'AC-3',
            requirementTitle: 'Access Enforcement',
          },
          {
            frameworkId: nist80053Id,
            frameworkName: 'NIST SP 800-53 Rev. 5',
            requirementCode: 'AC-6',
            requirementTitle: 'Least Privilege',
          },
          {
            frameworkId: nist80053Id,
            frameworkName: 'NIST SP 800-53 Rev. 5',
            requirementCode: 'IA-2',
            requirementTitle: 'Identification and Authentication',
          },
        ],
        coverageBenefit:
          'Implementing IAM-004 improves coverage across 6 frameworks and 18 requirements.',
        frameworkCount: 6,
        requirementCount: 18,
      },
      {
        id: 'ctrl-ac-001',
        code: 'AC-001',
        title: 'MFA required for privileged and remote access',
        description:
          'Enforce phishing-resistant multi-factor authentication (MFA) across all identity providers, SSH gateways, and cloud console portals.',
        owner: 'Identity & Access Team',
        category: 'Access Control',
        frameworkMappings: [
          {
            frameworkId: nistId,
            frameworkName: 'NIST CSF 2.0',
            requirementCode: 'PR.AA-01',
            requirementTitle: 'Identity Management & Authentication',
          },
          {
            frameworkId: isoId,
            frameworkName: 'ISO/IEC 27001:2022',
            requirementCode: 'A.8.5',
            requirementTitle: 'Secure Authentication',
          },
          {
            frameworkId: soc2Id,
            frameworkName: 'AICPA Trust Services Criteria (TSC)',
            requirementCode: 'CC6.1',
            requirementTitle: 'Logical Access Security',
          },
          {
            frameworkId: pciId,
            frameworkName: 'PCI DSS v4.0.1',
            requirementCode: '8.3',
            requirementTitle: 'Multi-Factor Authentication',
          },
          {
            frameworkId: cisId,
            frameworkName: 'CIS Controls v8',
            requirementCode: '6.5',
            requirementTitle: 'Centralize Access Control',
          },
        ],
        coverageBenefit:
          'Implementing AC-001 improves coverage across 5 frameworks and 5 requirements.',
        frameworkCount: 5,
        requirementCount: 5,
      },
      {
        id: 'ctrl-pol-001',
        code: 'POL-001',
        title: 'Information Security Policy Governance & Review',
        description:
          'Maintain, review annually, and disseminate core information security and risk governance policies.',
        owner: 'Security Governance',
        category: 'Governance',
        frameworkMappings: [
          {
            frameworkId: nistId,
            frameworkName: 'NIST CSF 2.0',
            requirementCode: 'GV.PO-01',
            requirementTitle: 'Policy Establishment & Enforcement',
          },
          {
            frameworkId: isoId,
            frameworkName: 'ISO/IEC 27001:2022',
            requirementCode: 'A.5.1',
            requirementTitle: 'Policies for Information Security',
          },
          {
            frameworkId: soc2Id,
            frameworkName: 'AICPA Trust Services Criteria (TSC)',
            requirementCode: 'CC1.1',
            requirementTitle: 'Integrity and Ethical Values',
          },
        ],
        coverageBenefit:
          'Implementing POL-001 improves coverage across 3 frameworks and 3 requirements.',
        frameworkCount: 3,
        requirementCount: 3,
      },
      {
        id: 'ctrl-log-002',
        code: 'LOG-002',
        title: 'Centralized SIEM Log Collection & 365-Day Retention',
        description:
          'Ingest and correlate authentication, audit, network, and system event logs into centralized SIEM with tamper-proof storage.',
        owner: 'SecOps & Infrastructure',
        category: 'Monitoring',
        frameworkMappings: [
          {
            frameworkId: nistId,
            frameworkName: 'NIST CSF 2.0',
            requirementCode: 'DE.AE-02',
            requirementTitle: 'Event and Alert Analysis',
          },
          {
            frameworkId: isoId,
            frameworkName: 'ISO/IEC 27001:2022',
            requirementCode: 'A.5.15',
            requirementTitle: 'Access Control',
          },
          {
            frameworkId: soc2Id,
            frameworkName: 'AICPA Trust Services Criteria (TSC)',
            requirementCode: 'CC7.2',
            requirementTitle: 'Security Event Monitoring',
          },
          {
            frameworkId: pciId,
            frameworkName: 'PCI DSS v4.0.1',
            requirementCode: '10.5',
            requirementTitle: 'Audit Log Retention & Protection',
          },
        ],
        coverageBenefit:
          'Implementing LOG-002 improves coverage across 4 frameworks and 4 requirements.',
        frameworkCount: 4,
        requirementCount: 4,
      },
      {
        id: 'ctrl-vuln-001',
        code: 'VULN-001',
        title: 'Quarterly Vulnerability Scanning & Remediation SLA',
        description:
          'Execute automated vulnerability scanning across all cloud and on-prem assets with strict remediation deadlines.',
        owner: 'Cloud Security',
        category: 'Vulnerability Management',
        frameworkMappings: [
          {
            frameworkId: nistId,
            frameworkName: 'NIST CSF 2.0',
            requirementCode: 'ID.RA-01',
            requirementTitle: 'Vulnerability Identification',
          },
          {
            frameworkId: soc2Id,
            frameworkName: 'AICPA Trust Services Criteria (TSC)',
            requirementCode: 'CC7.2',
            requirementTitle: 'Monitoring & Anomaly Detection',
          },
          {
            frameworkId: csaCcmId,
            frameworkName: 'CSA Cloud Controls Matrix (CCM v4)',
            requirementCode: 'TVM-01',
            requirementTitle: 'Threat & Vulnerability Management',
          },
        ],
        coverageBenefit:
          'Implementing VULN-001 improves coverage across 3 frameworks and 3 requirements.',
        frameworkCount: 3,
        requirementCount: 3,
      },
      {
        id: 'ctrl-bcp-001',
        code: 'BCP-001',
        title: 'Disaster Recovery & Business Continuity Testing',
        description:
          'Perform annual simulated disaster recovery failovers to validate RTO (<4h) and RPO (<15m) recovery capabilities.',
        owner: 'DevOps & Reliability',
        category: 'Resilience',
        frameworkMappings: [
          {
            frameworkId: nistId,
            frameworkName: 'NIST CSF 2.0',
            requirementCode: 'RC.RP-01',
            requirementTitle: 'Incident Recovery Plan Execution',
          },
          {
            frameworkId: soc2Id,
            frameworkName: 'AICPA Trust Services Criteria (TSC)',
            requirementCode: 'CC9.1',
            requirementTitle: 'Risk Mitigation & Continuity',
          },
          {
            frameworkId: iso31000Id,
            frameworkName: 'ISO 31000:2018',
            requirementCode: 'RC-01',
            requirementTitle: 'Risk Treatment & Continuity',
          },
        ],
        coverageBenefit:
          'Implementing BCP-001 improves coverage across 3 frameworks and 3 requirements.',
        frameworkCount: 3,
        requirementCount: 3,
      },
      {
        id: 'ctrl-dpa-001',
        code: 'DPA-001',
        title: 'Data Protection Agreements & Vendor Privacy Risk Management',
        description:
          'Execute standard contractual clauses and mandatory Data Protection Agreements (DPAs) with all external vendors processing personal data.',
        owner: 'Privacy & Legal Office',
        category: 'Privacy & Legal',
        frameworkMappings: [
          {
            frameworkId: gdprId,
            frameworkName: 'GDPR',
            requirementCode: 'Art. 28',
            requirementTitle: 'Processor Obligations & DPA Requirements',
          },
          {
            frameworkId: pipedaId,
            frameworkName: 'PIPEDA',
            requirementCode: 'Principle 1',
            requirementTitle: 'Accountability & Third-Party Protection',
          },
          {
            frameworkId: iso27701Id,
            frameworkName: 'ISO/IEC 27701:2019',
            requirementCode: 'PIMS-7.2.1',
            requirementTitle: 'Customer Agreement Alignment',
          },
          {
            frameworkId: soc2Id,
            frameworkName: 'AICPA Trust Services Criteria (TSC)',
            requirementCode: 'CC1.1',
            requirementTitle: 'Integrity & Ethical Standards',
          },
        ],
        coverageBenefit:
          'Implementing DPA-001 improves coverage across 4 frameworks and 4 requirements.',
        frameworkCount: 4,
        requirementCount: 4,
      },
    ];

    // Seed Evidence
    this.evidence = [
      {
        id: 'ev-1',
        frameworkId: nistId,
        requirementId: 'nist-gv-po-01',
        title: 'Information Security Policy.pdf',
        owner: 'CISO Office',
        evidenceType: 'Policy Document',
        source: 'Manual Upload',
        collectionDate: '2026-01-15',
        periodCovered: '2026-Q1 - 2026-Q4',
        expirationDate: '2027-01-15',
        verificationStatus: 'verified',
        url: 'https://docs.acme.corp/sec-policy-2026.pdf',
        linkedControls: ['POL-001', 'AC-001'],
        linkedRequirements: ['GV.PO-01', 'GV.PO-02'],
      },
      {
        id: 'ev-2',
        frameworkId: nistId,
        requirementId: 'nist-pr-aa-01',
        title: 'MFA Configuration Export',
        owner: 'SecOps Team',
        evidenceType: 'Config Export',
        source: 'Entra ID',
        collectionDate: '2026-07-01',
        periodCovered: '2026-Q3',
        expirationDate: '2026-12-31',
        verificationStatus: 'verified',
        url: 'https://entra.microsoft.com/policies/mfa-export-2026q3.json',
        linkedControls: ['AC-001'],
        linkedRequirements: ['PR.AA-01'],
      },
      {
        id: 'ev-3',
        frameworkId: nistId,
        requirementId: 'nist-pr-aa-01',
        title: 'Entra ID Conditional Access Screenshot',
        owner: 'Identity Admin',
        evidenceType: 'Screenshot',
        source: 'Azure Portal',
        collectionDate: '2026-08-10',
        periodCovered: '2026-Q3',
        expirationDate: '2026-12-31',
        verificationStatus: 'verified',
        linkedControls: ['AC-001'],
        linkedRequirements: ['PR.AA-01'],
      },
      {
        id: 'ev-4',
        frameworkId: nistId,
        requirementId: 'nist-pr-aa-02',
        title: 'Quarterly Access Review.xlsx',
        owner: 'IT Compliance',
        evidenceType: 'Spreadsheet',
        source: 'Okta / Jira',
        collectionDate: '2026-06-30',
        periodCovered: '2026-Q2',
        expirationDate: '2026-10-01',
        verificationStatus: 'verified',
        url: 'https://jira.acme.corp/browse/COMP-402',
        linkedControls: ['AC-001'],
        linkedRequirements: ['PR.AA-02'],
      },
      {
        id: 'ev-5',
        frameworkId: nistId,
        requirementId: 'nist-gv-po-01',
        title: 'ServiceNow Change Record CHG001234',
        owner: 'Release Manager',
        evidenceType: 'Ticket',
        source: 'ServiceNow',
        collectionDate: '2026-08-01',
        periodCovered: '2026-Q3',
        expirationDate: '2027-01-01',
        verificationStatus: 'verified',
        url: 'https://servicenow.acme.corp/nav_to.do?uri=change_request.do?sys_id=CHG001234',
        linkedControls: ['POL-001'],
        linkedRequirements: ['GV.PO-01'],
      },
    ];

    // Seed Assessments
    this.assessmentsList = [
      {
        id: 'asm-nist-2026',
        frameworkId: nistId,
        requirementId: 'nist-gv-po-01',
        cycleName: '2026 NIST CSF Assessment',
        status: 'completed',
        implementationStatus: 'partially_implemented',
        designEffectiveness: 'effective',
        operatingEffectiveness: 'partially_effective',
        assessor: 'John Smith (Lead Assessor)',
        assessmentDate: '2026-09-08',
        observation: 'Quarterly review evidence was unavailable for Q2 access re-certifications.',
        findingId: 'FIND-2026-0042',
        findingTitle: 'Missing Q2 Access Review Evidence',
        findingSeverity: 'high',
      },
      {
        id: 'asm-soc2-type2',
        frameworkId: soc2Id,
        requirementId: 'soc2-cc6-1',
        cycleName: 'SOC 2 Type II Annual Examination (2025–2026)',
        status: 'completed',
        implementationStatus: 'implemented',
        designEffectiveness: 'effective',
        operatingEffectiveness: 'effective',
        assessor: 'Ernst & Young LLP (Independent CPA)',
        assessmentDate: '2026-06-30',
        observation:
          'Unqualified SOC 2 Type II report issued for Security & Confidentiality Trust Services Criteria over the 12-month evaluation period.',
      },
      {
        id: 'asm-soc2-type1',
        frameworkId: soc2Id,
        requirementId: 'soc2-cc6-3',
        cycleName: 'SOC 2 Type I Point-in-time Readiness Assessment',
        status: 'completed',
        implementationStatus: 'implemented',
        designEffectiveness: 'effective',
        operatingEffectiveness: 'effective',
        assessor: 'GRC Advisory Services',
        assessmentDate: '2025-06-15',
        observation:
          'Suitability of the design of controls evaluated and confirmed in accordance with AICPA Trust Services Criteria.',
      },
      {
        id: 'asm-iso-cert',
        frameworkId: isoId,
        requirementId: 'iso-a5-15',
        cycleName: 'ISO/IEC 27001:2022 Stage 2 Certification Audit',
        status: 'completed',
        implementationStatus: 'implemented',
        designEffectiveness: 'effective',
        operatingEffectiveness: 'effective',
        assessor: 'BSI Group (Accredited Registrar)',
        assessmentDate: '2026-04-20',
        observation: 'Zero non-conformities identified across Annex A security controls.',
      },
    ];

    // Seed Activities
    this.activities = [
      {
        id: 'act-1',
        frameworkId: nistId,
        action: 'Assessment Cycle Completed',
        details: '2026 NIST CSF Assessment completed with 1 finding recorded.',
        actor: 'John Smith',
        timestamp: '2026-09-08T14:30:00Z',
      },
      {
        id: 'act-2',
        frameworkId: nistId,
        action: 'Evidence Linked',
        details: 'ServiceNow Change Record CHG001234 linked to GV.PO-01.',
        actor: 'Sarah Jenkins',
        timestamp: '2026-08-01T09:15:00Z',
      },
      {
        id: 'act-3',
        frameworkId: nistId,
        action: 'Requirement Updated',
        details: 'PR.AA-01 implementation status updated to Implemented.',
        actor: 'David Miller',
        timestamp: '2026-07-02T11:00:00Z',
      },
    ];

    // Seed Default Assets
    const defaultOrgId = '00000000-0000-0000-0000-000000000001';
    this.assets = [
      {
        id: '00000000-0000-0000-0000-00000000a001',
        orgId: defaultOrgId,
        userId: 'seed-user-id',
        code: 'AST-000101',
        name: 'Customer Payment API',
        type: 'api',
        criticality: 'critical',
        description:
          'Core microservice handling credit card transactions, tokenization, and checkout gateways.',
        owner: 'Digital Banking',
        businessOwner: 'Digital Banking',
        technicalOwner: 'Platform Engineering',
        department: 'Engineering',
        status: 'active',
        dataClassification: 'restricted',
        dataTypes: ['pii', 'pci', 'financial'],
        ciaConfidentiality: 'critical',
        ciaIntegrity: 'critical',
        ciaAvailability: 'critical',
        hostingType: 'cloud',
        environment: 'production',
        location: 'AWS us-east-1',
        internetFacing: true,
        isProduction: true,
        vendorName: 'Stripe / AWS',
        complianceScope: ['PCI DSS', 'SOC 2', 'NIST CSF 2.0'],
        tags: ['payments', 'tier-1', 'public-facing'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '00000000-0000-0000-0000-00000000a002',
        orgId: defaultOrgId,
        userId: 'seed-user-id',
        code: 'AST-000102',
        name: 'Customer Database Cluster',
        type: 'database',
        criticality: 'critical',
        description:
          'PostgreSQL primary cluster storing accounts, customer profiles, and transaction records.',
        owner: 'Data Platform',
        businessOwner: 'Core Banking',
        technicalOwner: 'DBA Team',
        department: 'Data Infrastructure',
        status: 'active',
        dataClassification: 'restricted',
        dataTypes: ['pii', 'customer_data', 'financial'],
        ciaConfidentiality: 'critical',
        ciaIntegrity: 'critical',
        ciaAvailability: 'high',
        hostingType: 'cloud',
        environment: 'production',
        location: 'AWS us-east-1 RDS',
        internetFacing: false,
        isProduction: true,
        relatedAssetIds: ['00000000-0000-0000-0000-00000000a001'],
        complianceScope: ['PCI DSS', 'SOC 2', 'GDPR', 'ISO 27001'],
        tags: ['database', 'rds', 'pii-store'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '00000000-0000-0000-0000-00000000a003',
        orgId: defaultOrgId,
        userId: 'seed-user-id',
        code: 'AST-000103',
        name: 'Microsoft 365 Enterprise',
        type: 'cloud_service',
        criticality: 'high',
        description:
          'Corporate productivity suite including Exchange email, Teams, SharePoint, and OneDrive.',
        owner: 'IT Operations',
        businessOwner: 'Corporate Operations',
        technicalOwner: 'IT Helpdesk',
        department: 'Information Technology',
        status: 'active',
        dataClassification: 'confidential',
        dataTypes: ['employee_data', 'customer_data'],
        ciaConfidentiality: 'high',
        ciaIntegrity: 'high',
        ciaAvailability: 'high',
        hostingType: 'saas',
        environment: 'production',
        location: 'Global SaaS',
        internetFacing: true,
        isProduction: true,
        vendorName: 'Microsoft Corporation',
        complianceScope: ['SOC 2', 'ISO 27001', 'GDPR'],
        tags: ['saas', 'collaboration', 'email'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '00000000-0000-0000-0000-00000000a004',
        orgId: defaultOrgId,
        userId: 'seed-user-id',
        code: 'AST-000104',
        name: 'Corporate Web Application',
        type: 'web_app',
        criticality: 'medium',
        description: 'Public marketing website and customer onboarding web portal.',
        owner: 'Marketing Team',
        businessOwner: 'Marketing',
        technicalOwner: 'Frontend Team',
        department: 'Growth & Marketing',
        status: 'active',
        dataClassification: 'public',
        dataTypes: ['customer_data'],
        ciaConfidentiality: 'low',
        ciaIntegrity: 'high',
        ciaAvailability: 'high',
        hostingType: 'cloud',
        environment: 'production',
        location: 'Vercel Edge / AWS CloudFront',
        internetFacing: true,
        isProduction: true,
        complianceScope: ['SOC 2'],
        tags: ['web', 'frontend', 'marketing'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  seedFramework(fw: Framework): void {
    this.frameworks.set(fw.id, fw);
  }

  seedControl(c: FrameworkControl): void {
    this.controls.set(c.id, c);
  }

  async listFrameworks(orgId?: string): Promise<Framework[]> {
    const list = [...this.frameworks.values()];
    if (!orgId) return list;
    return list.map((fw) => {
      const statusOverride = this.frameworkOrgStatus.get(`${orgId}:${fw.id}`);
      return statusOverride ? { ...fw, status: statusOverride } : fw;
    });
  }

  async getFramework(id: string, orgId?: string): Promise<Framework | null> {
    let fw = this.frameworks.get(id) ?? null;
    if (!fw) {
      fw = [...this.frameworks.values()].find((f) => f.slug === id || f.id === id) ?? null;
      if (!fw && (id === 'soc2' || id === 'soc-2')) {
        fw = this.frameworks.get('00000000-0000-0000-0000-000000000001') ?? null;
      }
    }
    if (!fw) return null;
    if (orgId) {
      const statusOverride = this.frameworkOrgStatus.get(`${orgId}:${fw.id}`);
      if (statusOverride) return { ...fw, status: statusOverride };
    }
    return fw;
  }

  async createFramework(orgId: string, input: FrameworkInput): Promise<Framework> {
    const id = globalThis.crypto.randomUUID();
    const now = new Date().toISOString();
    const reqsInput = input.requirements ?? [];
    const createdReqs: FrameworkRequirement[] = reqsInput.map((r, i) => ({
      id: `${id}-req-${i + 1}`,
      frameworkId: id,
      code: r.code,
      title: r.title,
      description: r.description,
      functionCode: r.functionCode ?? 'GEN',
      functionName: r.functionName ?? 'General',
      categoryCode: r.categoryCode ?? r.code.split('-')[0] ?? 'GEN',
      categoryName: r.categoryName ?? 'General Controls',
      guidance: r.guidance ?? '',
      references: r.references ?? [],
      applicability: 'applicable',
      implementationStatus: 'not_implemented',
      evidenceCount: 0,
      mappedControlsCount: 0,
      openFindingsCount: 0,
    }));

    const fw: Framework = {
      id,
      slug: input.slug,
      name: input.name,
      description: input.description,
      version: input.version,
      category: input.category,
      status: input.status ?? 'enabled',
      lastUpdated: new Date().getFullYear().toString(),
      controlCount: createdReqs.length,
      functionsCount: new Set(createdReqs.map((r) => r.functionCode)).size || 1,
      categoriesCount: new Set(createdReqs.map((r) => r.categoryCode)).size || 1,
      requirementsCount: createdReqs.length,
      applicableCount: createdReqs.length,
      notApplicableCount: 0,
      notReviewedCount: 0,
      isCustom: true,
      createdAt: now,
      updatedAt: now,
    };

    this.frameworks.set(id, fw);
    if (createdReqs.length > 0) {
      this.requirements.set(id, createdReqs);
    }
    this.activities.unshift({
      id: globalThis.crypto.randomUUID(),
      frameworkId: id,
      action: 'Framework Added',
      details: `Framework ${fw.name} (${fw.version}) was added to the organization library.`,
      actor: 'Current User',
      timestamp: now,
    });
    return fw;
  }

  async updateFramework(id: string, orgId: string, patch: FrameworkPatch): Promise<Framework> {
    const fw = this.frameworks.get(id);
    if (!fw) throw new Error(`framework_not_found: ${id}`);
    if (patch.status) {
      this.frameworkOrgStatus.set(`${orgId}:${id}`, patch.status);
    }
    const updated: Framework = {
      ...fw,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.frameworks.set(id, updated);
    return updated;
  }

  async deleteFramework(id: string, orgId: string): Promise<void> {
    if (!this.frameworks.has(id)) throw new Error(`framework_not_found: ${id}`);
    this.frameworks.delete(id);
    this.requirements.delete(id);
    this.frameworkOrgStatus.delete(`${orgId}:${id}`);
  }

  async listRequirements(frameworkId: string, orgId?: string): Promise<FrameworkRequirement[]> {
    let reqs = this.requirements.get(frameworkId);
    if (!reqs) {
      const controls = await this.listControlsByFramework(frameworkId);
      reqs = controls.map((c) => ({
        id: c.id,
        frameworkId,
        code: c.code,
        title: c.title,
        description: c.description,
        categoryCode: c.code.split('.')[0] ?? c.code,
        categoryName: c.category,
        applicability: 'applicable',
        implementationStatus: 'not_implemented',
        evidenceCount: 0,
        mappedControlsCount: 0,
        openFindingsCount: 0,
      }));
      this.requirements.set(frameworkId, reqs);
    }

    if (!orgId) return reqs;

    return reqs.map((r) => {
      const override = this.orgRequirementOverrides.get(`${orgId}:${frameworkId}:${r.code}`);
      return override ? { ...r, ...override } : r;
    });
  }

  async getRequirement(
    frameworkId: string,
    reqId: string,
    orgId?: string,
  ): Promise<FrameworkRequirement | null> {
    const reqs = await this.listRequirements(frameworkId, orgId);
    return reqs.find((r) => r.id === reqId || r.code === reqId) ?? null;
  }

  async updateRequirement(
    frameworkId: string,
    reqId: string,
    orgId: string,
    patch: FrameworkRequirementPatch,
  ): Promise<FrameworkRequirement> {
    const reqs = await this.listRequirements(frameworkId, orgId);
    const target = reqs.find((r) => r.id === reqId || r.code === reqId);
    if (!target) throw new Error(`requirement_not_found: ${reqId}`);

    const existingOverride =
      this.orgRequirementOverrides.get(`${orgId}:${frameworkId}:${target.code}`) ?? {};
    const updatedOverride = { ...existingOverride, ...patch };
    this.orgRequirementOverrides.set(`${orgId}:${frameworkId}:${target.code}`, updatedOverride);

    // Record activity
    const now = new Date().toISOString();
    let changeDetails = `Updated requirement ${target.code}`;
    if (patch.applicability) changeDetails += ` applicability to ${patch.applicability}`;
    if (patch.implementationStatus)
      changeDetails += ` implementation to ${patch.implementationStatus}`;
    this.activities.unshift({
      id: globalThis.crypto.randomUUID(),
      frameworkId,
      action: 'Requirement Updated',
      details: changeDetails,
      actor: 'Current User',
      timestamp: now,
    });

    return { ...target, ...updatedOverride };
  }

  async listInternalControls(_orgId?: string, frameworkId?: string): Promise<InternalControl[]> {
    if (!frameworkId) return [...this.internalControls];
    return this.internalControls.filter((c) =>
      c.frameworkMappings?.some((m) => m.frameworkId === frameworkId),
    );
  }

  async createInternalControl(orgId: string, data: InternalControlInput): Promise<InternalControl> {
    const control: InternalControl = {
      id: `ctrl-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      operator: '',
      keyControl: false,
      parentControlId: null,
      implementationStatus: 'not_implemented',
      implementationDescription: '',
      designEffectiveness: 'not_tested',
      operatingEffectiveness: 'not_tested',
      frameworkMappings: [],
      evidenceCount: 0,
      findingsCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    };
    this.internalControls.push(control);
    return control;
  }

  async getInternalControl(id: string, _orgId?: string): Promise<InternalControl | null> {
    return this.internalControls.find((c) => c.id === id) ?? null;
  }

  async updateInternalControl(id: string, patch: InternalControlPatch): Promise<InternalControl> {
    const control = this.internalControls.find((c) => c.id === id);
    if (!control) throw new Error(`internal_control_not_found: ${id}`);
    Object.assign(control, patch, { updatedAt: new Date().toISOString() });
    return control;
  }

  async deleteInternalControl(id: string): Promise<void> {
    this.internalControls = this.internalControls.filter((c) => c.id !== id);
  }

  async addControlFrameworkMapping(
    controlId: string,
    data: ControlFrameworkMappingInput,
  ): Promise<InternalControl> {
    const control = this.internalControls.find((c) => c.id === controlId);
    if (!control) throw new Error(`internal_control_not_found: ${controlId}`);
    if (!control.frameworkMappings) {
      control.frameworkMappings = [];
    }
    control.frameworkMappings.push({ id: globalThis.crypto.randomUUID(), ...data });
    control.frameworkCount = new Set(control.frameworkMappings.map((m) => m.frameworkId)).size;
    control.requirementCount = control.frameworkMappings.length;
    control.updatedAt = new Date().toISOString();
    return control;
  }

  async removeControlFrameworkMapping(
    controlId: string,
    mappingId: string,
  ): Promise<InternalControl> {
    const control = this.internalControls.find((c) => c.id === controlId);
    if (!control) throw new Error(`internal_control_not_found: ${controlId}`);
    control.frameworkMappings = (control.frameworkMappings ?? []).filter((m) => m.id !== mappingId);
    control.frameworkCount = new Set(control.frameworkMappings.map((m) => m.frameworkId)).size;
    control.requirementCount = control.frameworkMappings.length;
    control.updatedAt = new Date().toISOString();
    return control;
  }

  async listControlEvidence(controlId: string): Promise<RequirementEvidence[]> {
    return this.evidence.filter((e) => e.controlId === controlId);
  }

  async createControlEvidence(
    orgId: string,
    controlId: string,
    data: Omit<RequirementEvidence, 'id' | 'controlId'>,
  ): Promise<RequirementEvidence> {
    const ev: RequirementEvidence = {
      id: `ev-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      controlId,
      ...data,
    };
    this.evidence.unshift(ev);
    const control = this.internalControls.find((c) => c.id === controlId);
    if (control) control.evidenceCount = (control.evidenceCount ?? 0) + 1;
    this.activities.unshift({
      id: globalThis.crypto.randomUUID(),
      controlId,
      action: 'Evidence Uploaded',
      details: `Evidence item "${data.title}" added by ${data.owner}.`,
      actor: data.owner,
      timestamp: new Date().toISOString(),
    });
    return ev;
  }

  async listControlAssessments(controlId: string): Promise<RequirementAssessment[]> {
    return this.assessmentsList.filter((a) => a.controlId === controlId);
  }

  async createControlAssessment(
    orgId: string,
    controlId: string,
    data: Omit<RequirementAssessment, 'id' | 'controlId'>,
  ): Promise<RequirementAssessment> {
    const assessment: RequirementAssessment = {
      id: `asm-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      controlId,
      ...data,
    };
    this.assessmentsList.unshift(assessment);

    const control = this.internalControls.find((c) => c.id === controlId);
    if (control) {
      control.designEffectiveness = assessment.designEffectiveness;
      control.operatingEffectiveness = assessment.operatingEffectiveness;
      control.updatedAt = new Date().toISOString();
    }

    if (
      assessment.operatingEffectiveness === 'ineffective' ||
      assessment.operatingEffectiveness === 'partially_effective'
    ) {
      const findingNum = Math.floor(1000 + Math.random() * 9000);
      const finding: Finding = {
        id: globalThis.crypto.randomUUID(),
        orgId,
        code: `FIND-${new Date().getFullYear()}-${findingNum}`,
        controlId,
        assessmentId: assessment.id,
        title: `${control?.title ?? 'Control'} — ${assessment.operatingEffectiveness.replace('_', ' ')}`,
        description: assessment.observation,
        severity: assessment.operatingEffectiveness === 'ineffective' ? 'high' : 'medium',
        status: 'open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.findings.unshift(finding);
      assessment.findingId = finding.id;
      assessment.findingTitle = finding.title;
      assessment.findingSeverity = finding.severity;
      if (control) control.findingsCount = (control.findingsCount ?? 0) + 1;
    }

    this.activities.unshift({
      id: globalThis.crypto.randomUUID(),
      controlId,
      action: 'Assessment Completed',
      details: `Cycle "${assessment.cycleName}" — operating effectiveness: ${assessment.operatingEffectiveness}.`,
      actor: assessment.assessor,
      timestamp: new Date().toISOString(),
    });

    return assessment;
  }

  async listControlFindings(controlId: string): Promise<Finding[]> {
    return this.findings.filter((f) => f.controlId === controlId);
  }

  async linkFindingToRisk(findingId: string, riskId: string): Promise<Finding> {
    const finding = this.findings.find((f) => f.id === findingId);
    if (!finding) throw new Error(`finding_not_found: ${findingId}`);
    finding.linkedRiskId = riskId;
    finding.updatedAt = new Date().toISOString();
    return finding;
  }

  async linkFindingToIssue(findingId: string, issueId: string): Promise<Finding> {
    const finding = this.findings.find((f) => f.id === findingId);
    if (!finding) throw new Error(`finding_not_found: ${findingId}`);
    finding.linkedIssueId = issueId;
    finding.updatedAt = new Date().toISOString();
    return finding;
  }

  async resolveFindingViaException(findingId: string, exceptionId: string): Promise<Finding> {
    const finding = this.findings.find((f) => f.id === findingId);
    if (!finding) throw new Error(`finding_not_found: ${findingId}`);
    finding.linkedExceptionId = exceptionId;
    finding.status = 'accepted';
    finding.updatedAt = new Date().toISOString();
    return finding;
  }

  async listControlActivity(controlId: string): Promise<FrameworkActivity[]> {
    return this.activities.filter((a) => a.controlId === controlId);
  }

  async listFrameworkEvidence(
    frameworkId: string,
    _orgId?: string,
  ): Promise<RequirementEvidence[]> {
    return this.evidence.filter((e) => e.frameworkId === frameworkId);
  }

  async createFrameworkEvidence(
    orgId: string,
    data: Omit<RequirementEvidence, 'id'>,
  ): Promise<RequirementEvidence> {
    const ev: RequirementEvidence = {
      id: `ev-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      ...data,
    };
    this.evidence.unshift(ev);
    this.activities.unshift({
      id: globalThis.crypto.randomUUID(),
      frameworkId: data.frameworkId,
      action: 'Evidence Uploaded',
      details: `Evidence item "${data.title}" added by ${data.owner}.`,
      actor: data.owner,
      timestamp: new Date().toISOString(),
    });
    return ev;
  }

  async listFrameworkAssessments(
    frameworkId: string,
    _orgId?: string,
  ): Promise<RequirementAssessment[]> {
    return this.assessmentsList.filter((a) => a.frameworkId === frameworkId);
  }

  async createAssessmentFinding(
    orgId: string,
    assessmentId: string,
    findingData: {
      title: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
    },
  ): Promise<{ findingId: string }> {
    const findingNum = Math.floor(1000 + Math.random() * 9000);
    const findingId = `FIND-${new Date().getFullYear()}-${findingNum}`;

    await this.createIssue(orgId, 'system', {
      title: findingData.title,
      description: findingData.description,
      severity: findingData.severity,
      reporterId: 'system',
      ownerId: 'system',
    });

    const asm = this.assessmentsList.find((a) => a.id === assessmentId);
    if (asm) {
      asm.findingId = findingId;
      asm.findingTitle = findingData.title;
      asm.findingSeverity = findingData.severity;
    }

    return { findingId };
  }

  async listFrameworkActivities(
    frameworkId: string,
    _orgId?: string,
  ): Promise<FrameworkActivity[]> {
    return this.activities.filter((a) => a.frameworkId === frameworkId);
  }

  async listControlsByFramework(frameworkId: string): Promise<FrameworkControl[]> {
    return [...this.controls.values()].filter((c) => c.frameworkId === frameworkId);
  }

  async listStandardsByFramework(orgId: string, frameworkId: string): Promise<DocumentStandard[]> {
    const docs = [...this.docs.values()].filter((d) => d.orgId === orgId);
    const seen = new Set<string>();
    const result: DocumentStandard[] = [];
    for (const doc of docs) {
      for (const std of doc.standards) {
        if (
          std.frameworkMappings.some((m) => m.frameworkId === frameworkId) &&
          !seen.has(std.code)
        ) {
          seen.add(std.code);
          result.push(std);
        }
      }
    }
    return result;
  }

  async listOrganizations(userId: string): Promise<Organization[]> {
    return [...this.orgs.values()].filter((o) => o.userId === userId);
  }

  async createOrganization(userId: string, data: OrganizationInput): Promise<Organization> {
    const now = new Date().toISOString();
    const org: Organization = {
      id: globalThis.crypto.randomUUID(),
      userId,
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.orgs.set(org.id, org);
    return org;
  }

  async getOrganizationById(orgId: string): Promise<Organization | null> {
    return this.orgs.get(orgId) ?? null;
  }

  async updateOrganization(orgId: string, data: OrganizationInput): Promise<Organization> {
    const existing = this.orgs.get(orgId);
    if (!existing) throw new Error(`org_not_found: ${orgId}`);
    const updated: Organization = { ...existing, ...data, updatedAt: new Date().toISOString() };
    this.orgs.set(orgId, updated);
    return updated;
  }

  async deleteOrganization(orgId: string): Promise<void> {
    if (!this.orgs.has(orgId)) throw new Error(`org_not_found: ${orgId}`);
    this.orgs.delete(orgId);
  }

  async createStandardsDocument(
    userId: string,
    orgId: string,
    frameworkIds: string[],
  ): Promise<{ id: string }> {
    const id = globalThis.crypto.randomUUID();
    this.docs.set(id, {
      id,
      userId,
      orgId,
      frameworkIds,
      standards: [],
      status: 'pending',
      workflowStatus: 'draft',
      createdAt: new Date().toISOString(),
    });
    return { id };
  }

  async saveStandardsDocument(id: string, standards: DocumentStandard[]): Promise<void> {
    const existing = this.docs.get(id);
    if (!existing) throw new Error(`doc_not_found: ${id}`);
    this.docs.set(id, { ...existing, standards, status: 'completed' });
  }

  async failStandardsDocument(id: string, _reason?: string): Promise<void> {
    const existing = this.docs.get(id);
    if (!existing) throw new Error(`doc_not_found: ${id}`);
    this.docs.set(id, { ...existing, status: 'failed' });
  }

  async deleteStandardsDocument(id: string): Promise<void> {
    if (!this.docs.has(id)) throw new Error(`doc_not_found: ${id}`);
    this.docs.delete(id);
  }

  async resetStandardsDocument(id: string): Promise<void> {
    const existing = this.docs.get(id);
    if (!existing) throw new Error(`doc_not_found: ${id}`);
    this.docs.set(id, { ...existing, status: 'pending', standards: [] });
  }

  async getStandardsDocument(id: string): Promise<StandardsDocument | null> {
    return this.docs.get(id) ?? null;
  }

  async listStandardsDocuments(orgId: string): Promise<StandardsDocument[]> {
    return [...this.docs.values()].filter((d) => d.orgId === orgId);
  }

  async updateStandard(
    docId: string,
    code: string,
    patch: StandardPatch,
  ): Promise<DocumentStandard> {
    const doc = this.docs.get(docId);
    if (!doc) throw new Error(`doc_not_found: ${docId}`);
    const idx = doc.standards.findIndex((s) => s.code === code);
    if (idx === -1) throw new Error(`standard_not_found: ${code}`);
    const updated = { ...doc.standards[idx], ...patch } as DocumentStandard;
    const standards = [...doc.standards];
    standards[idx] = updated;
    this.docs.set(docId, { ...doc, standards });
    return updated;
  }

  async transitionWorkflow(id: string, transition: WorkflowTransition): Promise<StandardsDocument> {
    const doc = this.docs.get(id);
    if (!doc) throw new Error(`doc_not_found: ${id}`);
    const { from, to } = WORKFLOW_TRANSITIONS[transition];
    if (doc.workflowStatus !== from) {
      throw new Error(`invalid_transition: ${doc.workflowStatus} → ${transition}`);
    }
    const updated = { ...doc, workflowStatus: to };
    this.docs.set(id, updated);
    if (transition === 'approve') {
      const version = this.snapshots.filter((s) => s.documentId === id).length + 1;
      this.snapshots.push({
        id: globalThis.crypto.randomUUID(),
        documentId: id,
        version,
        workflowStatus: to,
        standards: [...doc.standards],
        createdAt: new Date().toISOString(),
      });
    }
    return updated;
  }

  async listSnapshots(documentId: string): Promise<StandardsSnapshot[]> {
    return this.snapshots
      .filter((s) => s.documentId === documentId)
      .sort((a, b) => b.version - a.version);
  }

  async getSnapshot(snapshotId: string): Promise<StandardsSnapshot | null> {
    return this.snapshots.find((s) => s.id === snapshotId) ?? null;
  }

  async saveGapAnalysis(
    orgId: string,
    userId: string,
    docId: string | null,
    result: GapAnalysisResult,
  ): Promise<GapAnalysis> {
    const analysis: GapAnalysis = {
      id: globalThis.crypto.randomUUID(),
      orgId,
      userId,
      docId,
      result,
      riskScore: result.riskScore,
      createdAt: new Date().toISOString(),
    };
    this.gapAnalyses.push(analysis);
    return analysis;
  }

  async listGapAnalyses(orgId: string): Promise<GapAnalysis[]> {
    return this.gapAnalyses.filter((g) => g.orgId === orgId);
  }

  async getGapAnalysis(id: string): Promise<GapAnalysis | null> {
    return this.gapAnalyses.find((g) => g.id === id) ?? null;
  }

  async getUserPrefs(userId: string): Promise<UserPrefsPayload> {
    return this.userPrefs.get(userId) ?? { ...DEFAULT_USER_PREFS };
  }

  async updateUserPrefs(
    userId: string,
    patch: Partial<UserPrefsPayload>,
  ): Promise<UserPrefsPayload> {
    const current = await this.getUserPrefs(userId);
    const updated: UserPrefsPayload = {
      ...current,
      ...patch,
      notificationPrefs: patch.notificationPrefs
        ? { ...current.notificationPrefs, ...patch.notificationPrefs }
        : current.notificationPrefs,
    };
    this.userPrefs.set(userId, updated);
    return updated;
  }

  async savePushSubscription(
    userId: string,
    sub: PushSubscriptionPayload,
  ): Promise<{ ok: boolean }> {
    const existing = this.pushSubscriptions.get(userId) ?? [];
    const filtered = existing.filter((s) => s.endpoint !== sub.endpoint);
    this.pushSubscriptions.set(userId, [...filtered, sub]);
    return { ok: true };
  }

  async removePushSubscription(userId: string, endpoint: string): Promise<{ ok: boolean }> {
    const existing = this.pushSubscriptions.get(userId) ?? [];
    this.pushSubscriptions.set(
      userId,
      existing.filter((s) => s.endpoint !== endpoint),
    );
    return { ok: true };
  }

  async getChatHistory(userId: string, limit = 100): Promise<AiChatMessage[]> {
    const msgs = this.chatMessages.get(userId) ?? [];
    return msgs.slice(-limit);
  }

  async saveChatMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<AiChatMessage> {
    const msg: AiChatMessage = {
      id: globalThis.crypto.randomUUID(),
      role,
      content,
      createdAt: new Date().toISOString(),
    };
    const existing = this.chatMessages.get(userId) ?? [];
    this.chatMessages.set(userId, [...existing, msg]);
    return msg;
  }

  async clearChatHistory(userId: string): Promise<{ ok: boolean }> {
    this.chatMessages.delete(userId);
    return { ok: true };
  }

  async logAuditEvent(
    userId: string,
    action: string,
    resourceType?: string,
    resourceId?: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const log: AuditLog = {
      id: globalThis.crypto.randomUUID(),
      userId,
      action,
      resourceType: resourceType ?? null,
      resourceId: resourceId ?? null,
      metadata,
      createdAt: new Date().toISOString(),
    };
    const existing = this.auditLogs.get(userId) ?? [];
    this.auditLogs.set(userId, [...existing, log]);
  }

  async listAuditLogs(userId: string, filters: AuditLogFilters = {}): Promise<AuditLogPage> {
    const { page = 1, limit = 50, action, from, to } = filters;
    let items = this.auditLogs.get(userId) ?? [];
    if (action) items = items.filter((l) => l.action === action);
    if (from) items = items.filter((l) => l.createdAt >= from);
    if (to) items = items.filter((l) => l.createdAt <= to);
    items = [...items].reverse();
    const total = items.length;
    const start = (page - 1) * limit;
    return { items: items.slice(start, start + limit), total, page, limit };
  }

  async createApiKey(userId: string, name: string, expiresAt?: string): Promise<ApiKeyWithSecret> {
    const rawKey = `cpiq_${globalThis.crypto.randomUUID().replace(/-/g, '')}`;
    const keyPrefix = rawKey.slice(0, 12);
    const key: ApiKey = {
      id: globalThis.crypto.randomUUID(),
      userId,
      name,
      keyPrefix,
      expiresAt: expiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    };
    const existing = this.apiKeys.get(userId) ?? [];
    this.apiKeys.set(userId, [...existing, key]);
    return { ...key, fullKey: rawKey };
  }

  async listApiKeys(userId: string): Promise<ApiKey[]> {
    return this.apiKeys.get(userId) ?? [];
  }

  async revokeApiKey(id: string, userId: string): Promise<{ ok: boolean }> {
    const keys = this.apiKeys.get(userId) ?? [];
    this.apiKeys.set(
      userId,
      keys.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)),
    );
    return { ok: true };
  }

  async createWebhook(userId: string, input: WebhookInput): Promise<Webhook> {
    const wh: Webhook = {
      id: globalThis.crypto.randomUUID(),
      userId,
      url: input.url,
      events: input.events,
      secret: globalThis.crypto.randomUUID().replace(/-/g, ''),
      active: true,
      createdAt: new Date().toISOString(),
    };
    const existing = this.webhooks.get(userId) ?? [];
    this.webhooks.set(userId, [...existing, wh]);
    return wh;
  }

  async listWebhooks(userId: string): Promise<Webhook[]> {
    return this.webhooks.get(userId) ?? [];
  }

  async updateWebhook(
    id: string,
    userId: string,
    patch: Partial<WebhookInput> & { active?: boolean },
  ): Promise<Webhook> {
    const hooks = this.webhooks.get(userId) ?? [];
    let updated: Webhook | undefined;
    this.webhooks.set(
      userId,
      hooks.map((w) => {
        if (w.id !== id) return w;
        updated = { ...w, ...patch };
        return updated;
      }),
    );
    if (!updated) throw new Error(`Webhook ${id} not found`);
    return updated;
  }

  async deleteWebhook(id: string, userId: string): Promise<{ ok: boolean }> {
    const hooks = this.webhooks.get(userId) ?? [];
    this.webhooks.set(
      userId,
      hooks.filter((w) => w.id !== id),
    );
    return { ok: true };
  }

  async getRetentionPrefs(userId: string): Promise<RetentionPrefsPayload> {
    return this.retentionPrefs.get(userId) ?? { ...DEFAULT_RETENTION_PREFS };
  }

  async updateRetentionPrefs(
    userId: string,
    patch: Partial<RetentionPrefsPayload>,
  ): Promise<RetentionPrefsPayload> {
    const current = await this.getRetentionPrefs(userId);
    const updated = { ...current, ...patch };
    this.retentionPrefs.set(userId, updated);
    return updated;
  }

  async listReportTemplates(): Promise<ReportTemplate[]> {
    return this.reportTemplates;
  }

  async createReportTemplate(userId: string, input: ReportTemplateInput): Promise<ReportTemplate> {
    const tpl: ReportTemplate = {
      id: `tpl-${this.reportTemplates.length + 1}`,
      ...input,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };
    this.reportTemplates.push(tpl);
    return tpl;
  }

  async updateReportTemplate(
    id: string,
    patch: Partial<ReportTemplateInput>,
  ): Promise<ReportTemplate> {
    const existing = this.reportTemplates.find((t) => t.id === id);
    if (!existing) throw new Error(`ReportTemplate ${id} not found`);
    const updated: ReportTemplate = { ...existing, ...patch };
    this.reportTemplates = this.reportTemplates.map((t) => (t.id === id ? updated : t));
    return updated;
  }

  async deleteReportTemplate(id: string): Promise<{ ok: boolean }> {
    this.reportTemplates = this.reportTemplates.filter((t) => t.id !== id);
    return { ok: true };
  }

  async addTemplateFavorite(id: string, orgId: string): Promise<ReportTemplate> {
    const tpl = this.reportTemplates.find((t) => t.id === id);
    if (!tpl) throw new Error(`ReportTemplate ${id} not found`);
    if (!tpl.favoriteOrgIds.includes(orgId)) {
      return this.updateReportTemplate(id, { favoriteOrgIds: [...tpl.favoriteOrgIds, orgId] });
    }
    return tpl;
  }

  async removeTemplateFavorite(id: string, orgId: string): Promise<ReportTemplate> {
    const tpl = this.reportTemplates.find((t) => t.id === id);
    if (!tpl) throw new Error(`ReportTemplate ${id} not found`);
    return this.updateReportTemplate(id, {
      favoriteOrgIds: tpl.favoriteOrgIds.filter((o) => o !== orgId),
    });
  }

  logAiUsage(_entry: AiUsageLogEntry): void {
    // fire-and-forget stub — no-op in tests
  }

  async getAiUsageSummary(_since: string, _userId?: string): Promise<AiUsageSummaryRpc> {
    return {
      total_calls: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      success_count: 0,
      error_count: 0,
      by_provider: [],
      by_operation: [],
      by_key_source: [],
      by_user: [],
    };
  }

  async getAiUsageTimeseries(_since: string, _userId?: string): Promise<AiUsageTimeseriesPoint[]> {
    return [];
  }

  // ─── Exceptions ────────────────────────────────────────────────────────────

  async listExceptions(orgId: string): Promise<Exception[]> {
    return [...this.exceptions.values()].filter((e) => e.orgId === orgId);
  }

  async createException(orgId: string, userId: string, data: ExceptionInput): Promise<Exception> {
    const now = new Date().toISOString();
    const exc: Exception = {
      id: globalThis.crypto.randomUUID(),
      orgId,
      userId,
      controlCode: data.controlCode,
      standardCode: data.standardCode,
      frameworkId: data.frameworkId,
      title: data.title,
      statement: data.statement,
      justification: data.justification,
      ownerId: data.ownerId,
      compensatingControls: data.compensatingControls,
      status: 'pending',
      expiresAt: data.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.exceptions.set(exc.id, exc);
    return exc;
  }

  async getException(id: string): Promise<Exception | null> {
    return this.exceptions.get(id) ?? null;
  }

  async updateException(id: string, patch: ExceptionPatch): Promise<Exception> {
    const existing = this.exceptions.get(id);
    if (!existing) throw new Error(`exception_not_found: ${id}`);
    const updated: Exception = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.exceptions.set(id, updated);
    return updated;
  }

  async approveException(id: string): Promise<Exception> {
    const existing = this.exceptions.get(id);
    if (!existing) throw new Error('exception_not_found');
    const approved: Exception = {
      ...existing,
      status: 'approved',
      updatedAt: new Date().toISOString(),
    };
    this.exceptions.set(id, approved);
    return approved;
  }

  async rejectException(id: string): Promise<Exception> {
    const existing = this.exceptions.get(id);
    if (!existing) throw new Error(`exception_not_found: ${id}`);
    const rejected: Exception = {
      ...existing,
      status: 'rejected',
      updatedAt: new Date().toISOString(),
    };
    this.exceptions.set(id, rejected);
    return rejected;
  }

  async deleteException(id: string): Promise<void> {
    if (!this.exceptions.has(id)) throw new Error(`exception_not_found: ${id}`);
    this.exceptions.delete(id);
  }

  // ─── Issues ────────────────────────────────────────────────────────────────

  async listIssues(orgId: string): Promise<Issue[]> {
    return [...this.issues.values()].filter((i) => i.orgId === orgId);
  }

  async createIssue(orgId: string, userId: string, data: IssueInput): Promise<Issue> {
    const now = new Date().toISOString();
    const issue: Issue = {
      id: globalThis.crypto.randomUUID(),
      orgId,
      userId,
      title: data.title,
      description: data.description,
      severity: data.severity,
      reporterId: data.reporterId,
      ownerId: data.ownerId,
      affectedAssets: data.affectedAssets,
      status: 'open',
      source: data.source ?? 'manual',
      sourceId: data.sourceId ?? null,
      dueDate: data.dueDate ?? null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.issues.set(issue.id, issue);
    return issue;
  }

  async getIssue(id: string): Promise<Issue | null> {
    return this.issues.get(id) ?? null;
  }

  async updateIssue(id: string, patch: IssuePatch): Promise<Issue> {
    const existing = this.issues.get(id);
    if (!existing) throw new Error('issue_not_found');
    const resolvedAt: string | null =
      'resolvedAt' in patch
        ? (patch.resolvedAt ?? null)
        : patch.status === 'resolved'
          ? new Date().toISOString()
          : patch.status !== undefined
            ? null
            : existing.resolvedAt;
    const updated: Issue = {
      ...existing,
      ...patch,
      resolvedAt,
      updatedAt: new Date().toISOString(),
    };
    this.issues.set(id, updated);
    return updated;
  }

  async deleteIssue(id: string): Promise<void> {
    if (!this.issues.has(id)) throw new Error(`issue_not_found: ${id}`);
    this.issues.delete(id);
  }

  // ─── Assets ──────────────────────────────────────────────────────────────
  private assets: Asset[] = [];

  async listAssets(orgId: string): Promise<Asset[]> {
    return this.assets.filter((a) => a.orgId === orgId);
  }

  async createAsset(orgId: string, userId: string, data: AssetInput): Promise<Asset> {
    const orgAssets = this.assets.filter((a) => a.orgId === orgId);
    const code = data.code || `AST-${String(orgAssets.length + 101).padStart(6, '0')}`;
    const asset: Asset = {
      id: globalThis.crypto.randomUUID(),
      orgId,
      userId,
      code,
      name: data.name,
      type: data.type,
      criticality: data.criticality,
      description: data.description || '',
      owner: data.owner || data.businessOwner || '',
      businessOwner: data.businessOwner || data.owner || '',
      technicalOwner: data.technicalOwner || '',
      department: data.department || '',
      status: data.status ?? 'active',
      dataClassification: data.dataClassification ?? 'internal',
      dataTypes: data.dataTypes ?? [],
      ciaConfidentiality: data.ciaConfidentiality ?? 'moderate',
      ciaIntegrity: data.ciaIntegrity ?? 'moderate',
      ciaAvailability: data.ciaAvailability ?? 'moderate',
      hostingType: data.hostingType || 'cloud',
      environment: data.environment || 'production',
      location: data.location || '',
      internetFacing: data.internetFacing ?? false,
      isProduction: data.isProduction ?? true,
      vendorId: data.vendorId ?? null,
      vendorName: data.vendorName || '',
      vendorIds: data.vendorIds ?? (data.vendorId ? [data.vendorId] : []),
      relatedAssetIds: data.relatedAssetIds ?? [],
      complianceScope: data.complianceScope ?? [],
      tags: data.tags ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.assets.push(asset);
    return asset;
  }

  async getAsset(id: string): Promise<Asset | null> {
    return this.assets.find((a) => a.id === id) ?? null;
  }

  async updateAsset(id: string, patch: AssetPatch): Promise<Asset> {
    const idx = this.assets.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error('asset_not_found');
    const existing = this.assets[idx]!;
    const updated: Asset = {
      ...existing,
      ...patch,
      owner:
        patch.owner !== undefined
          ? patch.owner
          : patch.businessOwner !== undefined
            ? patch.businessOwner
            : existing.owner,
      businessOwner:
        patch.businessOwner !== undefined
          ? patch.businessOwner
          : patch.owner !== undefined
            ? patch.owner
            : existing.businessOwner,
      updatedAt: new Date().toISOString(),
    };
    this.assets[idx] = updated;
    return updated;
  }

  async deleteAsset(id: string): Promise<void> {
    this.assets = this.assets.filter((a) => a.id !== id);
  }

  // ─── Risks ───────────────────────────────────────────────────────────────
  private risks: Risk[] = [];
  private riskSnapshots: RiskSnapshot[] = [];
  private riskMethodologies: RiskMethodology[] = [];
  private riskTaxonomy: RiskTaxonomyCategory[] = [];

  async getRiskMethodology(orgId: string): Promise<RiskMethodology | null> {
    const existing = this.riskMethodologies.find((m) => m.orgId === orgId && m.isActive);
    if (existing) return existing;
    const seeded: RiskMethodology = {
      id: `meth-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      version: 1,
      isActive: true,
      scaleSize: 5,
      likelihoodLabels: ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'],
      impactLabels: ['Insignificant', 'Minor', 'Moderate', 'Major', 'Severe'],
      thresholds: [
        { maxScore: 4, label: 'low' },
        { maxScore: 9, label: 'medium' },
        { maxScore: 16, label: 'high' },
        { maxScore: 25, label: 'critical' },
      ],
      appetiteThreshold: 9,
      createdAt: new Date().toISOString(),
    };
    this.riskMethodologies.push(seeded);
    return seeded;
  }

  async upsertRiskMethodology(orgId: string, data: RiskMethodologyInput): Promise<RiskMethodology> {
    const current = await this.getRiskMethodology(orgId);
    const nextVersion = (current?.version ?? 0) + 1;
    if (current) current.isActive = false;
    const updated: RiskMethodology = {
      id: `meth-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      version: nextVersion,
      isActive: true,
      createdAt: new Date().toISOString(),
      ...data,
    };
    this.riskMethodologies.push(updated);
    return updated;
  }

  async listRiskTaxonomy(orgId: string): Promise<RiskTaxonomyCategory[]> {
    const existing = this.riskTaxonomy.filter((c) => c.orgId === orgId);
    if (existing.length > 0) return existing;
    const defaults = [
      'Identity & Access',
      'Vulnerability Management',
      'Network Security',
      'Application Security',
      'Data Security',
      'Security Operations',
      'Incident Response',
      'Availability',
      'Infrastructure',
      'Architecture',
      'Change',
      'Cloud',
      'Technical Debt',
      'Supplier Security',
      'Concentration',
      'Supply Chain',
      'Outsourcing',
      'Privacy',
      'Compliance / Regulatory',
      'Operational',
      'Business Continuity / Resilience',
      'Strategic',
      'Financial',
    ];
    const seeded = defaults.map((name) => ({
      id: `rtc-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      name,
      archived: false,
      createdAt: new Date().toISOString(),
    }));
    this.riskTaxonomy.push(...seeded);
    return seeded;
  }

  async createRiskTaxonomyCategory(
    orgId: string,
    data: RiskTaxonomyCategoryInput,
  ): Promise<RiskTaxonomyCategory> {
    const category: RiskTaxonomyCategory = {
      id: `rtc-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      name: data.name,
      archived: false,
      createdAt: new Date().toISOString(),
    };
    this.riskTaxonomy.push(category);
    return category;
  }

  async archiveRiskTaxonomyCategory(id: string): Promise<RiskTaxonomyCategory> {
    const category = this.riskTaxonomy.find((c) => c.id === id);
    if (!category) throw new Error(`risk_taxonomy_category_not_found: ${id}`);
    category.archived = true;
    return category;
  }

  private computeRiskScore(likelihood: RiskLikelihood, impact: RiskImpact): number {
    const L: Record<RiskLikelihood, number> = {
      very_low: 1,
      low: 2,
      medium: 3,
      high: 4,
      very_high: 5,
    };
    const I: Record<RiskImpact, number> = {
      very_low: 1,
      low: 2,
      medium: 3,
      high: 4,
      very_high: 5,
    };
    return L[likelihood] * I[impact];
  }

  async listRisks(orgId: string): Promise<Risk[]> {
    return this.risks.filter((r) => r.orgId === orgId);
  }

  async createRisk(orgId: string, userId: string, data: RiskInput): Promise<Risk> {
    const methodology = await this.getRiskMethodology(orgId);
    if (!methodology) throw new Error('risk_methodology_not_found');
    const { score, label } = this.scoreRisk(
      methodology,
      data.inherentLikelihood,
      data.inherentImpact,
    );
    const orgRiskCount = this.risks.filter((r) => r.orgId === orgId).length;
    const risk: Risk = {
      id: globalThis.crypto.randomUUID(),
      riskId: `RSK-${String(orgRiskCount + 101).padStart(6, '0')}`,
      orgId,
      userId,
      title: data.title,
      riskStatement: data.riskStatement,
      taxonomyCategoryId: data.taxonomyCategoryId,
      ownerId: data.ownerId,
      businessUnit: data.businessUnit,
      source: data.source ?? 'manual',
      sourceRef: data.sourceRef,
      assetIds: data.assetIds ?? [],
      vendorIds: data.vendorIds ?? [],
      methodologyId: methodology.id,
      inherentLikelihood: data.inherentLikelihood,
      inherentImpact: data.inherentImpact,
      inherentScore: score,
      inherentLabel: label,
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.risks.push(risk);
    return risk;
  }

  private scoreRisk(
    methodology: RiskMethodology,
    likelihood: number,
    impact: number,
  ): { score: number; label: RiskScoreLabel } {
    const score = likelihood * impact;
    const band = methodology.thresholds.find((t) => score <= t.maxScore);
    return { score, label: band?.label ?? 'critical' };
  }

  async getRisk(id: string): Promise<Risk | null> {
    return this.risks.find((r) => r.id === id) ?? null;
  }

  async updateRisk(
    id: string,
    patch: RiskPatch,
    changedBy: string,
    reason?: string,
  ): Promise<Risk> {
    const risk = this.risks.find((r) => r.id === id);
    if (!risk) throw new Error(`risk_not_found: ${id}`);

    const scoreFieldsChanging =
      patch.inherentLikelihood !== undefined ||
      patch.inherentImpact !== undefined ||
      patch.residualLikelihood !== undefined ||
      patch.residualImpact !== undefined ||
      patch.treatmentStrategy !== undefined;

    if (scoreFieldsChanging) {
      this.riskSnapshots.unshift({
        id: globalThis.crypto.randomUUID(),
        riskId: id,
        inherentScore: risk.inherentScore,
        inherentLabel: risk.inherentLabel,
        residualScore: risk.residualScore,
        residualLabel: risk.residualLabel,
        treatmentStrategy: risk.treatmentStrategy,
        changedBy,
        reason,
        createdAt: new Date().toISOString(),
      });
    }

    Object.assign(risk, patch);

    const methodology = this.riskMethodologies.find((m) => m.id === risk.methodologyId);
    if (methodology) {
      if (patch.inherentLikelihood !== undefined || patch.inherentImpact !== undefined) {
        const { score, label } = this.scoreRisk(
          methodology,
          risk.inherentLikelihood,
          risk.inherentImpact,
        );
        risk.inherentScore = score;
        risk.inherentLabel = label;
      }
      if (
        (patch.residualLikelihood !== undefined || patch.residualImpact !== undefined) &&
        risk.residualLikelihood !== undefined &&
        risk.residualImpact !== undefined
      ) {
        const { score, label } = this.scoreRisk(
          methodology,
          risk.residualLikelihood,
          risk.residualImpact,
        );
        risk.residualScore = score;
        risk.residualLabel = label;
        risk.aboveAppetite = score > methodology.appetiteThreshold;
      }
    }

    risk.updatedAt = new Date().toISOString();
    return risk;
  }

  async deleteRisk(id: string): Promise<void> {
    this.risks = this.risks.filter((r) => r.id !== id);
  }

  // ─── Risk Assessments ────────────────────────────────────────────────────
  private assessments: RiskAssessment[] = [];
  private assessmentItems: RiskAssessmentItem[] = [];

  async listAssessments(orgId: string): Promise<RiskAssessment[]> {
    return this.assessments.filter((a) => a.orgId === orgId);
  }

  async createAssessment(
    orgId: string,
    userId: string,
    data: RiskAssessmentInput,
  ): Promise<RiskAssessment> {
    const now = new Date().toISOString();
    const assessment: RiskAssessment = {
      id: globalThis.crypto.randomUUID(),
      orgId,
      userId,
      type: data.type,
      title: data.title,
      scope: data.scope,
      status: 'draft',
      riskScore: 0,
      itemCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.assessments.push(assessment);
    return assessment;
  }

  async getAssessment(id: string): Promise<RiskAssessment | null> {
    return this.assessments.find((a) => a.id === id) ?? null;
  }

  async updateAssessment(id: string, patch: RiskAssessmentPatch): Promise<RiskAssessment> {
    const idx = this.assessments.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error('assessment_not_found');
    const updated: RiskAssessment = {
      ...this.assessments[idx]!,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.assessments[idx] = updated;
    return updated;
  }

  async deleteAssessment(id: string): Promise<void> {
    this.assessments = this.assessments.filter((a) => a.id !== id);
    this.assessmentItems = this.assessmentItems.filter((i) => i.assessmentId !== id);
  }

  async listAssessmentItems(assessmentId: string): Promise<RiskAssessmentItem[]> {
    return this.assessmentItems.filter((i) => i.assessmentId === assessmentId);
  }

  async addAssessmentItem(
    assessmentId: string,
    data: RiskAssessmentItemInput,
  ): Promise<RiskAssessmentItem> {
    const now = new Date().toISOString();
    const item: RiskAssessmentItem = {
      id: globalThis.crypto.randomUUID(),
      assessmentId,
      subject: data.subject,
      description: data.description,
      likelihood: data.likelihood,
      impact: data.impact,
      itemScore: this.computeRiskScore(data.likelihood, data.impact),
      mitigations: data.mitigations ?? '',
      createdAt: now,
      updatedAt: now,
    };
    this.assessmentItems.push(item);
    this.recomputeAssessmentScore(assessmentId);
    return item;
  }

  async updateAssessmentItem(
    id: string,
    patch: RiskAssessmentItemPatch,
  ): Promise<RiskAssessmentItem> {
    const idx = this.assessmentItems.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error('assessment_item_not_found');
    const existing = this.assessmentItems[idx]!;
    const merged: RiskAssessmentItem = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (patch.likelihood !== undefined || patch.impact !== undefined) {
      merged.itemScore = this.computeRiskScore(merged.likelihood, merged.impact);
    }
    this.assessmentItems[idx] = merged;
    this.recomputeAssessmentScore(merged.assessmentId);
    return merged;
  }

  async deleteAssessmentItem(id: string): Promise<void> {
    const item = this.assessmentItems.find((i) => i.id === id);
    this.assessmentItems = this.assessmentItems.filter((i) => i.id !== id);
    if (item) this.recomputeAssessmentScore(item.assessmentId);
  }

  private recomputeAssessmentScore(assessmentId: string): void {
    const items = this.assessmentItems.filter((i) => i.assessmentId === assessmentId);
    const idx = this.assessments.findIndex((a) => a.id === assessmentId);
    if (idx === -1) return;
    const riskScore =
      items.length > 0
        ? Math.round(items.reduce((sum, i) => sum + i.itemScore, 0) / items.length)
        : 0;
    this.assessments[idx] = {
      ...this.assessments[idx]!,
      riskScore,
      itemCount: items.length,
      updatedAt: new Date().toISOString(),
    };
  }

  // ─── Policies ────────────────────────────────────────────────────────────
  private policies: Policy[] = [];
  private policyTemplates: PolicyTemplate[] = [
    {
      id: 'tmpl-1',
      frameworkId: 'fw-soc2',
      title: 'SOC 2 Policy Template',
      content: '# SOC 2 Policy\n\nThis policy covers SOC 2 Type II requirements.',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  private policyControls: PolicyControl[] = [];

  async listPolicies(orgId: string): Promise<Policy[]> {
    return this.policies.filter((p) => p.orgId === orgId);
  }

  async createPolicy(orgId: string, userId: string, data: PolicyInput): Promise<Policy> {
    const policy: Policy = {
      id: crypto.randomUUID(),
      orgId,
      userId,
      frameworkId: data.frameworkId,
      title: data.title,
      content: data.content,
      status: 'draft',
      version: 1,
      templateId: data.templateId ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.policies.push(policy);
    return policy;
  }

  async getPolicy(id: string): Promise<Policy | null> {
    return this.policies.find((p) => p.id === id) ?? null;
  }

  async updatePolicy(id: string, patch: PolicyPatch): Promise<Policy> {
    const idx = this.policies.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('policy_not_found');
    const updated = { ...this.policies[idx], ...patch, updatedAt: new Date().toISOString() };
    if (patch.content !== undefined) updated.version = this.policies[idx]!.version + 1;
    this.policies[idx] = updated as Policy;
    return this.policies[idx]!;
  }

  async deletePolicy(id: string): Promise<void> {
    this.policyControls = this.policyControls.filter((c) => c.policyId !== id);
    this.policies = this.policies.filter((p) => p.id !== id);
  }

  async cloneTemplate(orgId: string, userId: string, templateId: string): Promise<Policy> {
    const tmpl = this.policyTemplates.find((t) => t.id === templateId);
    if (!tmpl) throw new Error('template_not_found');
    return this.createPolicy(orgId, userId, {
      frameworkId: tmpl.frameworkId,
      title: tmpl.title,
      content: tmpl.content,
      templateId: tmpl.id,
    });
  }

  async listPolicyTemplates(frameworkId?: string): Promise<PolicyTemplate[]> {
    if (frameworkId) return this.policyTemplates.filter((t) => t.frameworkId === frameworkId);
    return [...this.policyTemplates];
  }

  async listPolicyControls(policyId: string): Promise<PolicyControl[]> {
    return this.policyControls.filter((c) => c.policyId === policyId);
  }

  async addPolicyControl(policyId: string, data: PolicyControlInput): Promise<PolicyControl> {
    const existing = this.policyControls.find(
      (c) =>
        c.policyId === policyId &&
        c.controlCode === data.controlCode &&
        c.frameworkId === data.frameworkId,
    );
    if (existing) return existing;
    const pc: PolicyControl = {
      id: crypto.randomUUID(),
      policyId,
      controlCode: data.controlCode,
      frameworkId: data.frameworkId,
      createdAt: new Date().toISOString(),
    };
    this.policyControls.push(pc);
    return pc;
  }

  async removePolicyControl(id: string): Promise<void> {
    this.policyControls = this.policyControls.filter((c) => c.id !== id);
  }

  async listPoliciesForControl(controlCode: string, frameworkId: string): Promise<Policy[]> {
    const policyIds = this.policyControls
      .filter((c) => c.controlCode === controlCode && c.frameworkId === frameworkId)
      .map((c) => c.policyId);
    return this.policies.filter((p) => policyIds.includes(p.id));
  }
}
