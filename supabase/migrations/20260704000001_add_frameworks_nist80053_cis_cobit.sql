-- Seed additional compliance frameworks: NIST SP 800-53 Rev. 5, CIS Critical Security Controls, COBIT
insert into public.frameworks (id, slug, name, description, version, category) values
  ('00000000-0000-0000-0000-000000000005', 'nist-800-53', 'NIST SP 800-53 Rev. 5',            'NIST Security and Privacy Controls for Information Systems and Organizations — catalog of security controls', 'Rev. 5', 'security'),
  ('00000000-0000-0000-0000-000000000006', 'cis-controls', 'CIS Critical Security Controls',  'Center for Internet Security prioritized set of safeguards for operational security improvements',           'v8.1',   'security'),
  ('00000000-0000-0000-0000-000000000007', 'cobit',        'COBIT 2019',                      'ISACA framework for the governance and management of enterprise IT',                                         '2019',   'risk')
on conflict (slug) do nothing;

-- NIST SP 800-53 Rev. 5 controls (control families)
insert into public.controls (framework_id, code, title, description, category) values
  ('00000000-0000-0000-0000-000000000005', 'AC-1', 'Policy and Procedures',              'Develop, document, and disseminate access control policy and procedures', 'Access Control'),
  ('00000000-0000-0000-0000-000000000005', 'AC-2', 'Account Management',                 'Manage information system accounts, including establishment, activation, modification, and removal', 'Access Control'),
  ('00000000-0000-0000-0000-000000000005', 'AU-2', 'Event Logging',                      'Identify the types of events the system is capable of logging in support of the audit function', 'Audit and Accountability'),
  ('00000000-0000-0000-0000-000000000005', 'CM-2', 'Baseline Configuration',             'Develop, document, and maintain a current baseline configuration of the system', 'Configuration Management'),
  ('00000000-0000-0000-0000-000000000005', 'CP-9', 'System Backup',                      'Conduct backups of user-level and system-level information contained in the system', 'Contingency Planning'),
  ('00000000-0000-0000-0000-000000000005', 'IA-2', 'Identification and Authentication',  'Uniquely identify and authenticate organizational users and associate that identity with processes', 'Identification and Authentication'),
  ('00000000-0000-0000-0000-000000000005', 'IR-4', 'Incident Handling',                  'Implement an incident handling capability for incidents that is consistent with the response plan', 'Incident Response'),
  ('00000000-0000-0000-0000-000000000005', 'RA-5', 'Vulnerability Monitoring and Scanning', 'Monitor and scan for vulnerabilities in the system and hosted applications', 'Risk Assessment'),
  ('00000000-0000-0000-0000-000000000005', 'SC-7', 'Boundary Protection',                'Monitor and control communications at the external managed interfaces to the system', 'System and Communications Protection'),
  ('00000000-0000-0000-0000-000000000005', 'SI-4', 'System Monitoring',                  'Monitor the system to detect attacks, indicators of potential attacks, and unauthorized connections', 'System and Information Integrity')
on conflict (framework_id, code) do nothing;

-- CIS Critical Security Controls v8.1 (top-level controls)
insert into public.controls (framework_id, code, title, description, category) values
  ('00000000-0000-0000-0000-000000000006', 'CIS 1',  'Inventory and Control of Enterprise Assets', 'Actively manage all enterprise assets to accurately know the totality of assets that need to be monitored and protected', 'Asset Management'),
  ('00000000-0000-0000-0000-000000000006', 'CIS 2',  'Inventory and Control of Software Assets',   'Actively manage all software on the network so that only authorized software is installed and can execute', 'Asset Management'),
  ('00000000-0000-0000-0000-000000000006', 'CIS 3',  'Data Protection',                            'Develop processes and technical controls to identify, classify, securely handle, retain, and dispose of data', 'Data Protection'),
  ('00000000-0000-0000-0000-000000000006', 'CIS 4',  'Secure Configuration of Enterprise Assets and Software', 'Establish and maintain the secure configuration of enterprise assets and software', 'Configuration'),
  ('00000000-0000-0000-0000-000000000006', 'CIS 5',  'Account Management',                         'Use processes and tools to assign and manage authorization to credentials for user and admin accounts', 'Access Control'),
  ('00000000-0000-0000-0000-000000000006', 'CIS 6',  'Access Control Management',                  'Use processes and tools to create, assign, manage, and revoke access credentials and privileges', 'Access Control'),
  ('00000000-0000-0000-0000-000000000006', 'CIS 7',  'Continuous Vulnerability Management',        'Develop a plan to continuously assess and track vulnerabilities to remediate and minimize the window of opportunity', 'Vulnerability Management'),
  ('00000000-0000-0000-0000-000000000006', 'CIS 8',  'Audit Log Management',                       'Collect, alert, review, and retain audit logs of events that could help detect, understand, or recover from an attack', 'Monitoring'),
  ('00000000-0000-0000-0000-000000000006', 'CIS 10', 'Malware Defenses',                           'Prevent or control the installation, spread, and execution of malicious applications, code, or scripts', 'Malware Defenses'),
  ('00000000-0000-0000-0000-000000000006', 'CIS 11', 'Data Recovery',                              'Establish and maintain data recovery practices sufficient to restore in-scope enterprise assets to a trusted state', 'Recovery')
on conflict (framework_id, code) do nothing;

-- COBIT 2019 governance and management objectives
insert into public.controls (framework_id, code, title, description, category) values
  ('00000000-0000-0000-0000-000000000007', 'EDM01', 'Ensured Governance Framework Setting and Maintenance', 'Provide a consistent approach integrated with the enterprise governance approach', 'Evaluate, Direct and Monitor'),
  ('00000000-0000-0000-0000-000000000007', 'EDM02', 'Ensured Benefits Delivery',                'Optimize the value contribution to the business from I&T-enabled investments and services', 'Evaluate, Direct and Monitor'),
  ('00000000-0000-0000-0000-000000000007', 'EDM03', 'Ensured Risk Optimization',                'Ensure that I&T-related enterprise risk does not exceed risk appetite and tolerance', 'Evaluate, Direct and Monitor'),
  ('00000000-0000-0000-0000-000000000007', 'APO01', 'Managed I&T Management Framework',          'Design the management system for enterprise I&T based on governance objectives', 'Align, Plan and Organize'),
  ('00000000-0000-0000-0000-000000000007', 'APO12', 'Managed Risk',                             'Continually identify, assess, and reduce I&T-related risk within tolerance levels', 'Align, Plan and Organize'),
  ('00000000-0000-0000-0000-000000000007', 'APO13', 'Managed Security',                         'Define, operate, and monitor an information security management system', 'Align, Plan and Organize'),
  ('00000000-0000-0000-0000-000000000007', 'BAI06', 'Managed IT Changes',                       'Manage all changes in a controlled manner, including standard changes and emergency maintenance', 'Build, Acquire and Implement'),
  ('00000000-0000-0000-0000-000000000007', 'DSS01', 'Managed Operations',                       'Coordinate and execute the activities and operational procedures required to deliver I&T services', 'Deliver, Service and Support'),
  ('00000000-0000-0000-0000-000000000007', 'DSS02', 'Managed Service Requests and Incidents',   'Achieve increased productivity and minimize disruptions through quick resolution of user queries and incidents', 'Deliver, Service and Support'),
  ('00000000-0000-0000-0000-000000000007', 'MEA01', 'Managed Performance and Conformance Monitoring', 'Collect, validate, and evaluate enterprise and I&T goals and metrics', 'Monitor, Evaluate and Assess')
on conflict (framework_id, code) do nothing;
