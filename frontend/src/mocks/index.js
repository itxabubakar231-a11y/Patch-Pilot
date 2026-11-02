/**
 * PatchPilot Mock Data Fixtures
 * Matches authoritative response shapes defined in docs/API.md.
 */

export const mockOverview = {
  environment: "local_lab",
  is_simulated: true,
  proxy: {
    mode: "shadow",
    ready_for_enforce: false,
  },
  traffic: {
    total_requests: 5,
    allowed_requests: 3,
    shadow_matches: 2,
    blocked_requests: 0,
  },
  lab: {
    upstream: "127.0.0.1:8081",
    status: "online",
    simulated_stack: "Apache/2.4.52 + PHP/8.2.0",
  },
  advisories: {
    total: 1,
  },
  scanner: {
    status: "not_implemented",
  },
  generated_at: "2026-11-01T08:00:00Z",
}

export const mockProxyStatus = {
  mode: "shadow",
  ready_for_enforce: false,
  enabled_rule_count: 1,
  upstream: "127.0.0.1:8081",
  last_replay_at: null,
  updated_at: "2026-11-01T08:00:00Z",
}

export const mockRules = {
  items: [
    {
      id: 1,
      name: "Demo query marker",
      matcher_type: "query_param_equals",
      match_config: {
        name: "demo_attack",
        value: "true",
      },
      enabled: true,
      human_approved: true,
      source_kind: "demo",
      replay_passed: false,
      rule_digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
  ],
  total: 1,
  limit: 50,
  offset: 0,
}

export const mockTraffic = {
  items: [
    {
      id: 5,
      method: "GET",
      path: "/",
      mode: "shadow",
      action: "shadow_match",
      status_code: 200,
      matched_rule_id: 1,
      duration_ms: 8.7,
      created_at: "2026-11-01T08:05:40Z",
    },
    {
      id: 4,
      method: "POST",
      path: "/login.php",
      mode: "shadow",
      action: "allowed",
      status_code: 200,
      matched_rule_id: null,
      duration_ms: 12.1,
      created_at: "2026-11-01T08:05:15Z",
    },
    {
      id: 3,
      method: "GET",
      path: "/index.php",
      mode: "shadow",
      action: "shadow_match",
      status_code: 200,
      matched_rule_id: 1,
      duration_ms: 9.2,
      created_at: "2026-11-01T08:05:00Z",
    },
    {
      id: 2,
      method: "GET",
      path: "/about.php",
      mode: "shadow",
      action: "allowed",
      status_code: 200,
      matched_rule_id: null,
      duration_ms: 6.5,
      created_at: "2026-11-01T08:04:30Z",
    },
    {
      id: 1,
      method: "GET",
      path: "/",
      mode: "shadow",
      action: "allowed",
      status_code: 200,
      matched_rule_id: null,
      duration_ms: 5.8,
      created_at: "2026-11-01T08:04:00Z",
    },
  ],
  total: 5,
  limit: 50,
  offset: 0,
}

export const mockAdvisories = {
  advisory: {
    id: 1,
    external_id: "DEMO-ADVISORY-001",
    title: "Simulated Defensive Advisory (Local Lab Demo)",
    severity: "medium",
    summary: "Simulated advisory for local testing. Official vendor bulletins must be consulted for runtime fixes.",
    source_kind: "demo",
    source_url: null,
    verified: false,
    generated_by: "fixture",
    created_at: "2026-11-01T08:12:00Z",
  },
  localizations: [
    {
      language_code: "en",
      title: "Simulated Security Notice",
      summary: "Simulated demonstration advisory for the local lab environment.",
      recommended_action: "Review official vendor bulletins and apply tested software updates.",
      generated_by: "fixture",
    },
    {
      language_code: "ur",
      title: "نقلی سیکیورٹی اطلاع (ڈیمو)",
      summary: "یہ مقامی تجرباتی لیب کے لیے ایک نقلی سیکیورٹی اطلاع ہے۔",
      recommended_action: "سرکاری وینڈر بلیٹن دیکھیں اور ٹیسٹ شدہ سافٹ ویئر اپ ڈیٹس لاگو کریں۔",
      generated_by: "fixture",
    },
    {
      language_code: "ur-Latn",
      title: "Simulated Security Ittila (Demo)",
      summary: "Yeh local lab test environment ke liye aik simulated security advisory hai.",
      recommended_action: "Official vendor bulletin check karein aur tested software updates apply karein.",
      generated_by: "fixture",
    },
    {
      language_code: "ar",
      title: "إشعار أمني محاكى (عرض توضيحي)",
      summary: "إشعار أمني تجريبي لمحاكاة بيئة الاختبار المعملية المحلية.",
      recommended_action: "راجع نشرات البائع الرسمية وقم بتطبيق تحديثات البرامج المختبرة.",
      generated_by: "fixture",
    },
    {
      language_code: "es",
      title: "Aviso de seguridad simulado (Demostración)",
      summary: "Aviso de seguridad simulado para el entorno de laboratorio local.",
      recommended_action: "Revise los boletines oficiales del proveedor y aplique actualizaciones de software comprobadas.",
      generated_by: "fixture",
    },
  ],
  processing_mode: "fixture",
  is_simulated: true,
}

export default {
  mockOverview,
  mockProxyStatus,
  mockRules,
  mockTraffic,
  mockAdvisories,
}
