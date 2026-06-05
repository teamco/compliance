-- Seed compliance frameworks
insert into public.frameworks (id, slug, name, description, version, category) values
  ('00000000-0000-0000-0000-000000000001', 'soc2',       'SOC 2 Type II',       'AICPA Trust Services Criteria for security, availability, processing integrity, confidentiality, and privacy', '2017',  'security'),
  ('00000000-0000-0000-0000-000000000002', 'iso27001',   'ISO/IEC 27001:2022',  'International standard for information security management systems (ISMS)',                                      '2022',  'security'),
  ('00000000-0000-0000-0000-000000000003', 'nist-csf',   'NIST CSF 2.0',        'NIST Cybersecurity Framework — Identify, Protect, Detect, Respond, Recover',                                   '2.0',   'security'),
  ('00000000-0000-0000-0000-000000000004', 'gdpr',       'GDPR',                'General Data Protection Regulation — EU data protection and privacy law',                                      '2018',  'privacy')
on conflict (slug) do nothing;

-- SOC 2 controls (CC series — Common Criteria)
insert into public.controls (framework_id, code, title, description, category) values
  ('00000000-0000-0000-0000-000000000001', 'CC1.1', 'Control Environment', 'COSO principle: board demonstrates independence from management and exercises oversight', 'Control Environment'),
  ('00000000-0000-0000-0000-000000000001', 'CC1.2', 'Board Independence',  'Board of directors applies appropriate skill and expertise to oversee risk and controls', 'Control Environment'),
  ('00000000-0000-0000-0000-000000000001', 'CC2.1', 'Information & Communication', 'Entity obtains or generates relevant, high-quality information to support internal control', 'Communication'),
  ('00000000-0000-0000-0000-000000000001', 'CC3.1', 'Risk Assessment',     'Entity specifies objectives with sufficient clarity to enable identification and assessment of risks', 'Risk Assessment'),
  ('00000000-0000-0000-0000-000000000001', 'CC6.1', 'Logical Access',      'Entity implements logical access security software, infrastructure, and architectures over protected information assets', 'Access Control'),
  ('00000000-0000-0000-0000-000000000001', 'CC6.2', 'Access Provisioning', 'Prior to issuing credentials, entity registers and authorizes new internal and external users', 'Access Control'),
  ('00000000-0000-0000-0000-000000000001', 'CC6.3', 'Access Removal',      'Entity authorizes, modifies, or removes access to data, software, functions, and other assets', 'Access Control'),
  ('00000000-0000-0000-0000-000000000001', 'CC7.1', 'System Operations',   'To meet objectives, entity uses detection and monitoring procedures to identify changes', 'Monitoring'),
  ('00000000-0000-0000-0000-000000000001', 'CC7.2', 'Security Events',     'Entity monitors system components and the operation of those components for anomalies', 'Monitoring'),
  ('00000000-0000-0000-0000-000000000001', 'CC8.1', 'Change Management',   'Entity authorizes, designs, develops, acquires, implements, and maintains infrastructure', 'Change Management')
on conflict (framework_id, code) do nothing;

-- ISO 27001 controls (Annex A domains)
insert into public.controls (framework_id, code, title, description, category) values
  ('00000000-0000-0000-0000-000000000002', 'A.5.1',  'Information Security Policies',       'Management direction and support for information security in accordance with business requirements', 'Policies'),
  ('00000000-0000-0000-0000-000000000002', 'A.6.1',  'Internal Organisation',               'Management framework to initiate and control implementation and operation of information security', 'Organisation'),
  ('00000000-0000-0000-0000-000000000002', 'A.7.1',  'Prior to Employment',                 'Ensure employees understand their responsibilities and are suitable for their roles', 'Human Resources'),
  ('00000000-0000-0000-0000-000000000002', 'A.8.1',  'Responsibility for Assets',           'Identify organisational assets and define appropriate protection responsibilities', 'Asset Management'),
  ('00000000-0000-0000-0000-000000000002', 'A.9.1',  'Business Requirements for Access',    'Limit access to information and information processing facilities', 'Access Control'),
  ('00000000-0000-0000-0000-000000000002', 'A.10.1', 'Cryptographic Controls',              'Ensure proper and effective use of cryptography to protect confidentiality, authenticity, integrity', 'Cryptography'),
  ('00000000-0000-0000-0000-000000000002', 'A.12.1', 'Operational Procedures and Responsibilities', 'Ensure correct and secure operations of information processing facilities', 'Operations'),
  ('00000000-0000-0000-0000-000000000002', 'A.12.6', 'Technical Vulnerability Management', 'Prevent exploitation of technical vulnerabilities', 'Operations'),
  ('00000000-0000-0000-0000-000000000002', 'A.16.1', 'Management of Incidents',             'Ensure consistent and effective approach to management of security incidents', 'Incidents'),
  ('00000000-0000-0000-0000-000000000002', 'A.17.1', 'Business Continuity',                 'Counteract interruptions to business activities and protect critical processes', 'Business Continuity')
on conflict (framework_id, code) do nothing;

-- NIST CSF 2.0 functions + categories
insert into public.controls (framework_id, code, title, description, category) values
  ('00000000-0000-0000-0000-000000000003', 'GV.OC',  'Organizational Context',    'Understand circumstances surrounding cybersecurity risk decisions', 'Govern'),
  ('00000000-0000-0000-0000-000000000003', 'GV.RM',  'Risk Management Strategy',  'Prioritization, constraints, risk tolerance and risk appetite statements', 'Govern'),
  ('00000000-0000-0000-0000-000000000003', 'ID.AM',  'Asset Management',           'Assets are identified and managed consistent with risk strategy', 'Identify'),
  ('00000000-0000-0000-0000-000000000003', 'ID.RA',  'Risk Assessment',            'Cybersecurity risk to assets, systems, and people is identified and understood', 'Identify'),
  ('00000000-0000-0000-0000-000000000003', 'PR.AA',  'Identity Management & Access Control', 'Access to assets is limited to authorized users and devices', 'Protect'),
  ('00000000-0000-0000-0000-000000000003', 'PR.DS',  'Data Security',              'Data is managed consistent with the organization''s risk strategy', 'Protect'),
  ('00000000-0000-0000-0000-000000000003', 'DE.AE',  'Adverse Event Analysis',     'Anomalies, indicators of compromise, and their potential impact are analyzed', 'Detect'),
  ('00000000-0000-0000-0000-000000000003', 'DE.CM',  'Continuous Monitoring',      'Assets are monitored to find anomalies, indicators of compromise, and other adverse events', 'Detect'),
  ('00000000-0000-0000-0000-000000000003', 'RS.MA',  'Incident Management',        'Responses to detected cybersecurity incidents are managed', 'Respond'),
  ('00000000-0000-0000-0000-000000000003', 'RC.RP',  'Incident Recovery Plan',     'Restoration activities are performed to ensure operational availability', 'Recover')
on conflict (framework_id, code) do nothing;

-- GDPR articles as controls
insert into public.controls (framework_id, code, title, description, category) values
  ('00000000-0000-0000-0000-000000000004', 'Art.5',  'Principles for Processing', 'Lawfulness, fairness, transparency, purpose limitation, data minimisation, accuracy, storage limitation', 'Principles'),
  ('00000000-0000-0000-0000-000000000004', 'Art.6',  'Lawfulness of Processing',  'Processing only lawful if specific conditions met (consent, contract, legal obligation, etc.)', 'Lawfulness'),
  ('00000000-0000-0000-0000-000000000004', 'Art.13', 'Transparency — Collection', 'Provide information at time of collection from data subject', 'Transparency'),
  ('00000000-0000-0000-0000-000000000004', 'Art.17', 'Right to Erasure',          'Data subject has the right to erasure of personal data without undue delay', 'Data Subject Rights'),
  ('00000000-0000-0000-0000-000000000004', 'Art.25', 'Privacy by Design',         'Implement appropriate technical and organisational measures for data protection principles', 'By Design'),
  ('00000000-0000-0000-0000-000000000004', 'Art.30', 'Records of Processing',     'Maintain a record of processing activities under its responsibility', 'Documentation'),
  ('00000000-0000-0000-0000-000000000004', 'Art.32', 'Security of Processing',    'Implement appropriate technical and organisational measures to ensure security', 'Security'),
  ('00000000-0000-0000-0000-000000000004', 'Art.33', 'Breach Notification',       'Notify supervisory authority of personal data breach within 72 hours', 'Incidents'),
  ('00000000-0000-0000-0000-000000000004', 'Art.35', 'Data Protection Impact',    'Carry out DPIA prior to processing likely to result in high risk', 'Risk'),
  ('00000000-0000-0000-0000-000000000004', 'Art.37', 'Data Protection Officer',   'Designate DPO in certain circumstances', 'Governance')
on conflict (framework_id, code) do nothing;
