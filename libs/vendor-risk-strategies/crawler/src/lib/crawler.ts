import * as dns from 'node:dns/promises';
import * as tls from 'node:tls';
import type {
  CategoryResult,
  ScanCategory,
  ScanFinding,
  ScanGrade,
  ScanMode,
  VendorRiskStrategy,
  VendorScanResult,
} from '@icore/shared';

function toGrade(score: number): ScanGrade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function cat(score: number, findingCount: number): CategoryResult {
  return { score, grade: toGrade(score), findingCount };
}

export interface OwnCrawlerOptions {
  shodanApiKey?: string;
  hibpApiKey?: string;
  abuseipdbApiKey?: string;
  fetch?: typeof globalThis.fetch;
}

export class OwnCrawlerStrategy implements VendorRiskStrategy {
  private readonly fetch: typeof globalThis.fetch;

  constructor(private readonly opts: OwnCrawlerOptions = {}) {
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  async scan(domain: string, _mode: ScanMode): Promise<VendorScanResult> {
    const [dnsR, emailR, tlsR, webR, networkR, breachR, reputationR] = await Promise.allSettled([
      this.checkDns(domain),
      this.checkEmail(domain),
      this.checkTls(domain),
      this.checkWeb(domain),
      this.checkNetwork(domain),
      this.checkBreach(domain),
      this.checkReputation(domain),
    ]);

    function unwrap(
      r: PromiseSettledResult<{ score: number; findings: ScanFinding[] }>,
      fallback = 50,
    ) {
      return r.status === 'fulfilled' ? r.value : { score: fallback, findings: [] };
    }

    const dns_ = unwrap(dnsR);
    const email_ = unwrap(emailR);
    const tls_ = unwrap(tlsR);
    const web_ = unwrap(webR);
    const network_ = unwrap(networkR);
    const breach_ = unwrap(breachR);
    const reputation_ = unwrap(reputationR);

    const score = Math.round(
      dns_.score * 0.15 +
        email_.score * 0.15 +
        tls_.score * 0.2 +
        web_.score * 0.15 +
        network_.score * 0.15 +
        breach_.score * 0.1 +
        reputation_.score * 0.1,
    );

    const findings = [
      ...dns_.findings,
      ...email_.findings,
      ...tls_.findings,
      ...web_.findings,
      ...network_.findings,
      ...breach_.findings,
      ...reputation_.findings,
    ];

    const breakdown: Record<ScanCategory, CategoryResult> = {
      dns: cat(dns_.score, dns_.findings.length),
      email: cat(email_.score, email_.findings.length),
      tls: cat(tls_.score, tls_.findings.length),
      web: cat(web_.score, web_.findings.length),
      network: cat(network_.score, network_.findings.length),
      breach: cat(breach_.score, breach_.findings.length),
      reputation: cat(reputation_.score, reputation_.findings.length),
    };

    return { score, grade: toGrade(score), breakdown, findings };
  }

  private async checkDns(domain: string): Promise<{ score: number; findings: ScanFinding[] }> {
    const findings: ScanFinding[] = [];
    let score = 100;

    try {
      await dns.resolve4(domain);
    } catch {
      findings.push({
        category: 'dns',
        severity: 'high',
        title: 'No A record',
        detail: `${domain} has no IPv4 A record.`,
        remediation: 'Ensure DNS A record is configured.',
      });
      score -= 30;
    }

    try {
      const mx = await dns.resolveMx(domain);
      if (mx.length === 0) {
        findings.push({
          category: 'dns',
          severity: 'medium',
          title: 'No MX record',
          detail: 'Domain has no MX records configured.',
          remediation: 'Configure MX records for mail delivery.',
        });
        score -= 15;
      }
    } catch {
      score -= 10;
    }

    try {
      const ns = await dns.resolveNs(domain);
      if (ns.length < 2) {
        findings.push({
          category: 'dns',
          severity: 'low',
          title: 'Single nameserver',
          detail: 'Only one NS record found — no redundancy.',
          remediation: 'Add a secondary nameserver for redundancy.',
        });
        score -= 10;
      }
    } catch {
      score -= 5;
    }

    return { score: Math.max(0, score), findings };
  }

  private async checkEmail(domain: string): Promise<{ score: number; findings: ScanFinding[] }> {
    const findings: ScanFinding[] = [];
    let score = 100;

    try {
      const txt = await dns.resolveTxt(domain);
      const flat = txt.flat();
      const hasSPF = flat.some((r) => r.startsWith('v=spf1'));
      const hasDMARC = flat.some((r) => r.includes('v=DMARC1'));

      if (!hasSPF) {
        findings.push({
          category: 'email',
          severity: 'high',
          title: 'No SPF record',
          detail: 'Domain has no SPF TXT record.',
          remediation: 'Add an SPF record to prevent email spoofing.',
        });
        score -= 35;
      }

      if (!hasDMARC) {
        findings.push({
          category: 'email',
          severity: 'high',
          title: 'No DMARC policy',
          detail: 'Domain has no DMARC TXT record.',
          remediation: 'Add a DMARC record with at least p=quarantine.',
        });
        score -= 35;
      }
    } catch {
      score -= 20;
    }

    return { score: Math.max(0, score), findings };
  }

  private checkTls(domain: string): Promise<{ score: number; findings: ScanFinding[] }> {
    return new Promise((resolve) => {
      const findings: ScanFinding[] = [];
      let score = 100;

      const socket = tls.connect(
        { host: domain, port: 443, servername: domain, timeout: 5000 },
        () => {
          const cert = socket.getPeerCertificate();
          const protocol = socket.getProtocol();
          socket.destroy();

          if (protocol === 'TLSv1' || protocol === 'TLSv1.1') {
            findings.push({
              category: 'tls',
              severity: 'high',
              title: `Legacy TLS: ${protocol}`,
              detail: `Server negotiated ${protocol} which is deprecated.`,
              remediation: 'Disable TLS 1.0 and 1.1; require TLS 1.2+.',
            });
            score -= 40;
          }

          if (cert?.valid_to) {
            const expiry = new Date(cert.valid_to);
            const daysLeft = Math.floor((expiry.getTime() - Date.now()) / 86_400_000);
            if (daysLeft < 30) {
              findings.push({
                category: 'tls',
                severity: daysLeft < 7 ? 'critical' : 'high',
                title: `Certificate expires in ${daysLeft} days`,
                detail: `Certificate for ${domain} expires ${cert.valid_to}.`,
                remediation: 'Renew the TLS certificate immediately.',
              });
              score -= daysLeft < 7 ? 50 : 25;
            }
          }

          resolve({ score: Math.max(0, score), findings });
        },
      );

      socket.on('error', () => {
        findings.push({
          category: 'tls',
          severity: 'critical',
          title: 'TLS connection failed',
          detail: `Could not establish TLS connection to ${domain}:443.`,
          remediation: 'Ensure HTTPS is enabled and certificate is valid.',
        });
        resolve({ score: 0, findings });
      });
    });
  }

  private async checkWeb(domain: string): Promise<{ score: number; findings: ScanFinding[] }> {
    const findings: ScanFinding[] = [];
    let score = 100;

    try {
      const res = await this.fetch(`https://${domain}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });

      const checks: Array<{ header: string; title: string; remediation: string }> = [
        {
          header: 'strict-transport-security',
          title: 'Missing HSTS header',
          remediation: 'Add Strict-Transport-Security with max-age >= 31536000.',
        },
        {
          header: 'x-content-type-options',
          title: 'Missing X-Content-Type-Options',
          remediation: 'Add X-Content-Type-Options: nosniff.',
        },
        {
          header: 'x-frame-options',
          title: 'Missing X-Frame-Options',
          remediation: 'Add X-Frame-Options: DENY or SAMEORIGIN.',
        },
        {
          header: 'content-security-policy',
          title: 'Missing Content-Security-Policy',
          remediation: 'Implement a strict CSP header.',
        },
      ];

      for (const check of checks) {
        if (!res.headers.get(check.header)) {
          findings.push({
            category: 'web',
            severity: 'medium',
            title: check.title,
            detail: `Response from ${domain} is missing the ${check.header} header.`,
            remediation: check.remediation,
          });
          score -= 15;
        }
      }
    } catch {
      score -= 20;
    }

    return { score: Math.max(0, score), findings };
  }

  private async checkNetwork(domain: string): Promise<{ score: number; findings: ScanFinding[] }> {
    if (!this.opts.shodanApiKey) return { score: 70, findings: [] };

    const findings: ScanFinding[] = [];
    let score = 100;

    try {
      const ips = await dns.resolve4(domain);
      const ip = ips[0];
      const res = await this.fetch(
        `https://api.shodan.io/shodan/host/${ip}?key=${this.opts.shodanApiKey}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (res.ok) {
        const data = (await res.json()) as { ports?: number[] };
        const riskyPorts = (data.ports ?? []).filter((p) => [21, 23, 3389, 5900, 445].includes(p));
        for (const port of riskyPorts) {
          findings.push({
            category: 'network',
            severity: 'high',
            title: `Risky port ${port} exposed`,
            detail: `Port ${port} is publicly accessible on ${ip}.`,
            remediation: `Close or firewall port ${port} from public internet.`,
          });
          score -= 20;
        }
      }
    } catch {
      // Shodan unavailable — degrade gracefully
    }

    return { score: Math.max(0, score), findings };
  }

  private async checkBreach(domain: string): Promise<{ score: number; findings: ScanFinding[] }> {
    const findings: ScanFinding[] = [];
    let score = 100;

    try {
      const headers: Record<string, string> = { 'User-Agent': 'VendorRiskScanner/1.0' };
      if (this.opts.hibpApiKey) headers['hibp-api-key'] = this.opts.hibpApiKey;

      const res = await this.fetch(`https://haveibeenpwned.com/api/v3/breacheddomain/${domain}`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });

      if (res.status === 200) {
        const breaches = (await res.json()) as unknown[];
        if (breaches.length > 0) {
          findings.push({
            category: 'breach',
            severity: breaches.length > 3 ? 'critical' : 'high',
            title: `${breaches.length} known data breach(es)`,
            detail: `Domain ${domain} appears in ${breaches.length} breach dataset(s).`,
            remediation: 'Notify affected users and enforce password resets.',
          });
          score -= Math.min(50, breaches.length * 15);
        }
      }
    } catch {
      // HIBP unavailable — no penalty
    }

    return { score: Math.max(0, score), findings };
  }

  private async checkReputation(
    domain: string,
  ): Promise<{ score: number; findings: ScanFinding[] }> {
    if (!this.opts.abuseipdbApiKey) return { score: 70, findings: [] };

    const findings: ScanFinding[] = [];
    let score = 100;

    try {
      const ips = await dns.resolve4(domain);
      const ip = ips[0];
      const res = await this.fetch(
        `https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90`,
        {
          headers: { Key: this.opts.abuseipdbApiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { data?: { abuseConfidenceScore?: number } };
        const abuseScore = data.data?.abuseConfidenceScore ?? 0;
        if (abuseScore > 25) {
          findings.push({
            category: 'reputation',
            severity: abuseScore > 75 ? 'critical' : 'high',
            title: `IP abuse confidence: ${abuseScore}%`,
            detail: `IP ${ip} has ${abuseScore}% abuse confidence on AbuseIPDB.`,
            remediation: 'Investigate IP reputation and consider migrating to a cleaner IP range.',
          });
          score -= Math.min(60, abuseScore);
        }
      }
    } catch {
      // AbuseIPDB unavailable — no penalty
    }

    return { score: Math.max(0, score), findings };
  }
}
