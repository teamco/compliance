import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Cloud,
  Database,
  GitBranch,
  Lock,
  ScanSearch,
  Shield,
  Sparkles,
  Workflow,
} from 'lucide-react';

export const trustedFrameworks = ['ISO 27001', 'SOC 2', 'NIST CSF', 'PCI DSS', 'HIPAA', 'GDPR'];

export const heroMetrics = [
  { label: 'Compliance coverage', value: '94%', tone: 'green' },
  { label: 'Critical gaps', value: '12', tone: 'amber' },
  { label: 'Mapped controls', value: '247', tone: 'blue' },
  { label: 'AI recommendations', value: '38', tone: 'purple' },
];

export const platformModules = [
  {
    icon: Sparkles,
    title: 'AI Standards Generation',
    description:
      'Generate organization-ready policies, control libraries and governance standards from selected frameworks.',
    eyebrow: 'Standards',
  },
  {
    icon: ScanSearch,
    title: 'Gap Analysis',
    description:
      'Compare current practices against ISO, SOC 2, NIST and custom frameworks with severity scoring.',
    eyebrow: 'Assessment',
  },
  {
    icon: GitBranch,
    title: 'Control Mapping',
    description:
      'Map controls across multiple frameworks and avoid duplicate evidence collection across audit programs.',
    eyebrow: 'Controls',
  },
  {
    icon: Activity,
    title: 'Security Posture Scoring',
    description:
      'Track risk, maturity, open gaps and remediation progress in one executive-ready dashboard.',
    eyebrow: 'Posture',
  },
];

export const productWorkflow = [
  {
    title: 'Select frameworks',
    description: 'ISO 27001, SOC 2, NIST CSF, PCI DSS or custom requirements.',
  },
  {
    title: 'Generate standards',
    description: 'AI creates controls, policies and workflow-ready governance documents.',
  },
  {
    title: 'Analyze gaps',
    description: 'Teams add current-state evidence and receive prioritized findings.',
  },
  {
    title: 'Track remediation',
    description: 'Security leaders monitor coverage, risk reduction and audit readiness.',
  },
];

export const architectureBlocks = [
  {
    icon: Workflow,
    title: 'NestJS gateway',
    description: 'Typed API gateway with Swagger and microservice orchestration.',
  },
  {
    icon: Database,
    title: 'Supabase data layer',
    description: 'Auth, database and secure storage strategy behind the platform.',
  },
  {
    icon: Brain,
    title: 'Anthropic AI engine',
    description: 'Dedicated AI service for chat, standards generation and gap analysis.',
  },
  {
    icon: Cloud,
    title: 'Swappable transport',
    description: 'TCP today, ready for NATS, RabbitMQ or Kafka as scale increases.',
  },
];

export const securitySignals = [
  {
    icon: Lock,
    title: 'Role-based governance',
    description: 'Designed for security teams, auditors, admins and executive stakeholders.',
  },
  {
    icon: Shield,
    title: 'Evidence-aware workflows',
    description: 'Centralize control evidence and connect it to frameworks and gaps.',
  },
  {
    icon: AlertTriangle,
    title: 'Risk prioritization',
    description: 'Separate critical findings from cosmetic issues with severity and effort.',
  },
  {
    icon: CheckCircle2,
    title: 'Audit readiness',
    description: 'Convert generated controls and analysis results into repeatable audit workflows.',
  },
];

export const frameworkRows = [
  { name: 'ISO 27001', coverage: 97, status: 'Ready' },
  { name: 'SOC 2', coverage: 92, status: 'In review' },
  { name: 'NIST CSF', coverage: 89, status: 'Mapped' },
  { name: 'PCI DSS', coverage: 84, status: 'Gaps found' },
];
