/**
 * Net Console Pure Logic Library
 * Single source of truth for all pure functions.
 * 
 * ES module — imported by vitest tests.
 * For browser usage, see netconsole-lib.bundle.js (auto-generated).
 */

// ─── HTML escaping ────────────────────────────────────────────────────

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Utility ──────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ─── Config Diff Engine ───────────────────────────────────────────────

const DIFF_CATEGORIES = [
  { id: 'l2sec',    icon: '🔒', name: 'Sicurezza L2',  keywords: ['port-security','access-list','ip access','dot1x','authentication','mab','auth','storm-control','dhcp snooping','ip source guard','dynamic arp','arp inspection','portfast bpduguard'] },
  { id: 'stp',      icon: '🌀', name: 'STP',           keywords: ['spanning-tree','stp','root','priority','guard','bpdu','loopguard','rootguard','uplinkfast','backbonefast','mst','rapid-pvst','mode pvst'] },
  { id: 'routing',  icon: '📡', name: 'Routing',       keywords: ['router bgp','router ospf','router eigrp','router isis','ip route','ip prefix','route-map','neighbor','redistribute','network ','bfd','ip sla','track','vrf','ip vrf'] },
  { id: 'vlan',     icon: '🔗', name: 'VLAN',          keywords: ['vlan ','switchport','interface vlan','name ','trunk','access vlan','voice vlan','native vlan','vtp','vlan database'] },
  { id: 'hardening',icon: '🛡️', name: 'Hardening',    keywords: ['snmp','logging','ntp','aaa','tacacs','radius','username','password','secret','enable secret','service password','ip ssh','banner','exec-timeout','login','privilege','crypto','ssh','https','access-class','log-buffer'] },
  { id: 'qos',      icon: '⚡', name: 'QoS',           keywords: ['policy-map','class-map','service-policy','qos','cos','dscp','priority','bandwidth','shape','police','queue','mls qos','auto-qos','codec','voice-class'] },
];

function categorizeLine(line) {
  var lower = line.trim().toLowerCase();
  if (!lower || lower === '!' || lower === 'end') return null;
  for (var ci = 0; ci < DIFF_CATEGORIES.length; ci++) {
    var cat = DIFF_CATEGORIES[ci];
    for (var ki = 0; ki < cat.keywords.length; ki++) {
      if (lower.includes(cat.keywords[ki])) return cat.id;
    }
  }
  return null;
}

function classifyLines(linesA, linesB) {
  var setA = new Set(); var arrA = [];
  var setB = new Set(); var arrB = [];
  linesA.forEach(function(l) { var t = l.trim(); if (t && t !== '!' && t !== 'end') { setA.add(t); arrA.push(t); } });
  linesB.forEach(function(l) { var t = l.trim(); if (t && t !== '!' && t !== 'end') { setB.add(t); arrB.push(t); } });
  var result = {};
  DIFF_CATEGORIES.forEach(function(c) { result[c.id] = { added: [], removed: [], modified: [], identical: [] }; });
  result._uncategorized = { added: [], removed: [], modified: [], identical: [] };

  var consumedA = new Set();

  // Pre-build index: base → array of indices in arrA (for O(1) modified lookup)
  var baseIndexA = {};
  for (var ai = 0; ai < arrA.length; ai++) {
    var aLine = arrA[ai];
    if (setB.has(aLine)) continue; // already identical
    var aParts = aLine.split(/\s+/);
    var aBase = aParts.slice(0, Math.min(3, aParts.length)).join(' ');
    if (!baseIndexA[aBase]) baseIndexA[aBase] = [];
    baseIndexA[aBase].push(ai);
  }

  arrB.forEach(function(line) {
    if (setA.has(line)) {
      var cat = categorizeLine(line) || '_uncategorized';
      result[cat].identical.push(line);
    } else {
      var isMod = false;
      var bParts = line.split(/\s+/);
      var bBase = bParts.slice(0, Math.min(3, bParts.length)).join(' ');
      var candidates = baseIndexA[bBase];
      if (candidates) {
        for (var ci = 0; ci < candidates.length; ci++) {
          var aLine = arrA[candidates[ci]];
          if (consumedA.has(aLine)) continue;
          if (aLine !== line) {
            var cat2 = categorizeLine(line) || '_uncategorized';
            result[cat2].modified.push({ a: aLine, b: line });
            consumedA.add(aLine);
            isMod = true;
            break;
          }
        }
      }
      if (!isMod) {
        var cat3 = categorizeLine(line) || '_uncategorized';
        result[cat3].added.push(line);
      }
    }
  });

  arrA.forEach(function(line) {
    if (!setB.has(line) && !consumedA.has(line)) {
      var cat = categorizeLine(line) || '_uncategorized';
      result[cat].removed.push(line);
    }
  });

  return result;
}

// ─── Vendor / Device Detection ────────────────────────────────────────

var CISCO_KW = ['cisco','catalyst','nexus','interface gigabitethernet','router bgp','ip route','ip ssh','aaa new-model','spanning-tree vlan','switchport','ip access-list','bfd-template','ip sla','snmp-server','logging ','ntp server','service password','enable secret','username ','line vty','ip http','crypto key'];
var HUAWEI_KW = ['huawei','vrp','interface vlanif','display ','undo ','sysname','stelnet','hwtacacs','local-user','authentication-mode','speed auto','duplex auto','dhcp enable','vlan batch','port link-type','port default vlan','voice-vlan','ntp-service','snmp-agent','info-center','radius-server','acl number','traffic classifier','traffic behavior'];

function detectVendor(config, lowerConfig) {
  var c = lowerConfig || (config || '').toLowerCase();
  var ciscoScore = 0, huaweiScore = 0;

  for (var i = 0; i < CISCO_KW.length; i++) {
    if (c.indexOf(CISCO_KW[i]) !== -1) ciscoScore++;
  }
  for (var j = 0; j < HUAWEI_KW.length; j++) {
    if (c.indexOf(HUAWEI_KW[j]) !== -1) huaweiScore++;
  }

  if (ciscoScore > huaweiScore && ciscoScore >= 3) return 'cisco';
  if (huaweiScore > ciscoScore && huaweiScore >= 3) return 'huawei';
  if (ciscoScore > 0 && huaweiScore > 0) return 'mixed';
  return null;
}

var SWITCH_KW = ['switchport','spanning-tree','vlan','voice vlan','port-security','poe','lldp run','vtp','mac address-table','storm-control','portfast','bpduguard','stack','stackwise','port link-type','port default vlan'];
var ROUTER_KW = ['router bgp','router ospf','router eigrp','router isis','ip route 0.0.0.0','bfd','ip sla','nat','redistribute','route-map','neighbor ','vrf','ip vrf','mpls','l2vpn','xconnect'];

function detectDeviceType(config, lowerConfig) {
  var c = lowerConfig || (config || '').toLowerCase();
  var switchScore = 0, routerScore = 0;

  for (var i = 0; i < SWITCH_KW.length; i++) {
    if (c.indexOf(SWITCH_KW[i]) !== -1) switchScore++;
  }
  for (var j = 0; j < ROUTER_KW.length; j++) {
    if (c.indexOf(ROUTER_KW[j]) !== -1) routerScore++;
  }

  if (switchScore > routerScore && switchScore >= 2) return 'switch';
  if (routerScore > switchScore && routerScore >= 2) return 'router';
  if (switchScore > 0 && routerScore > 0) return 'switch';
  return 'unknown';
}

function hasFeature(config, keywords, lowerConfig) {
  var c = lowerConfig || (config || '').toLowerCase();
  for (var i = 0; i < keywords.length; i++) {
    if (c.indexOf(keywords[i]) !== -1) return true;
  }
  return false;
}

// ─── Skill Mapping ────────────────────────────────────────────────────

const SKILL_MAP = {
  cisco: {
    switch: ['cisco-standard-switch-base','cisco-standard-switch-lan','cisco-standard-etherchannel'],
    router: ['cisco-standard-wan-config','cisco-standard-nat-pat','cisco-standard-bfd','cisco-qos-policy'],
    defaults: ['cisco-standard-logging','cisco-standard-ntp','cisco-standard-radius-aaa','cisco-standard-management','cisco-smart-licensing']
  },
  huawei: {
    switch: ['huawei-standard-switch-base','huawei-standard-switch-lan','huawei-standard-switch-commands'],
    router: ['huawei-standard-wan-config','huawei-standard-nat-pat'],
    defaults: ['huawei-standard-logging','huawei-standard-ntp','huawei-standard-radius-aaa','huawei-standard-management']
  },
  bgp: {
    cisco:  ['cisco-bgp-lan-customer-z','cisco-bgp-lan-customer-a'],
    huawei: ['huawei-bgp-lan-customer-z','huawei-bgp-lan-customer-a']
  },
  routing: {
    cisco:  ['ip-sla-migration','change-management-static-routes'],
    huawei: ['huawei-standard-routing-scenario-z','huawei-standard-routing-scenario-a','huawei-standard-routing-scenario-c']
  },
  migration: ['migration-as-is-to-be','migration-mop-generation','migration-vrf-client-vpn'],
  discovery: ['discovery-matcher'],
  docs:     ['network-diagram-prompting','network-project-orchestrator']
};

const AGENT_TO_SKILL_CATEGORY = {
  'agent-discovery-assessment':  ['discovery'],
  'agent-delta-analysis':        ['discovery'],
  'agent-document-scaffolding':  ['docs'],
  'agent-cli-templating':        [],
  'agent-mop-generator':         ['migration'],
  'agent-migration-planner':     ['migration'],
  'agent-vendor-translation':    []
};

function getNetworkingSkills(vendor, deviceType, agentIds, configText) {
  var skills = [];
  var seen = {};

  function add(arr) {
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      if (!seen[arr[i]]) { seen[arr[i]] = true; skills.push(arr[i]); }
    }
  }

  var lc = configText ? configText.toLowerCase() : '';

  // Base skills per vendor + device type
  if (vendor && SKILL_MAP[vendor]) {
    add(SKILL_MAP[vendor].defaults);
    if (deviceType && SKILL_MAP[vendor][deviceType]) {
      add(SKILL_MAP[vendor][deviceType]);
    }
  }

  // Feature detection
  if (vendor && hasFeature(configText, ['router bgp','bgp ','neighbor','remote-as'], lc)) {
    add(SKILL_MAP.bgp && SKILL_MAP.bgp[vendor]);
  }
  if (vendor && hasFeature(configText, ['ip sla','track ','icmp-echo'], lc)) {
    if (SKILL_MAP.routing && SKILL_MAP.routing[vendor]) add(SKILL_MAP.routing[vendor]);
  }
  if (hasFeature(configText, ['bfd','fall-over bfd','bfd-template'], lc)) {
    add(['cisco-standard-bfd']);
  }
  if (hasFeature(configText, ['etherchannel','port-channel','channel-group','lacp','pagp'], lc)) {
    add(['cisco-standard-etherchannel']);
  }
  if (hasFeature(configText, ['qos','policy-map','class-map','service-policy','dscp','priority','bandwidth'], lc)) {
    add(['cisco-qos-policy']);
  }
  if (hasFeature(configText, ['dmvpn','tunnel protection','nhrp'], lc)) {
    add(['dmvpn-design']);
  }

  // Agent-based skills
  for (var ai = 0; ai < agentIds.length; ai++) {
    var cats = AGENT_TO_SKILL_CATEGORY[agentIds[ai]];
    if (cats) {
      for (var ci = 0; ci < cats.length; ci++) {
        add(SKILL_MAP[cats[ci]]);
      }
    }
  }

  return skills;
}

// ─── Agent Data ────────────────────────────────────────────────────────

const AGENTS = [
  { id: 'agent-discovery-assessment', label: '🔍 Discovery & Assessment', desc: 'Identifica scenario (Z/C/A/B/M2M) con confidence score e produce delta vs template standard. È il passo 0 di ogni pipeline.', inputs: '1 config sanitizzata', priority: 'Alta', next: '→ tutti gli altri agenti' },
  { id: 'agent-delta-analysis', label: '📊 Delta-Analysis', desc: 'Confronta due configurazioni (legacy vs nuova) in 6 categorie: sicurezza L2, STP, routing, VLAN, hardening, QoS.', inputs: '2 config (legacy + nuova)', priority: 'Alta', next: '→ Migration-planner, MOP' },
  { id: 'agent-document-scaffolding', label: '📄 Scaffolding Documenti', desc: 'Genera strutture HLD, LLD, Runbook, MOP, Agenda, Post-Mortem, ATP. Placeholder descrittivi, tu riempi il tecnico.', inputs: 'Tipo documento, contesto', priority: 'Alta', next: '→ Documento finale' },
  { id: 'agent-cli-templating', label: '⚙️ Templating CLI', desc: 'Script CLI parametrizzati con {{placeholder}}, commenti inline, comandi verifica, errori comuni.', inputs: 'Scenario, modello, IOS', priority: 'Alta', next: '→ MOP, Handover NOC' },
  { id: 'agent-mop-generator', label: '📋 MOP Generator', desc: 'Method of Procedure: pre-check, step con rollback, post-check, rollback globale. Eseguibile dal NOC.', inputs: 'Attività, apparati, servizi', priority: 'Alta', next: '→ Esecuzione NOC' },
  { id: 'agent-migration-planner', label: '🔄 Piano Migrazione', desc: 'Piano ZDT a 6 fasi: preparazione, attivazione parallela, migrazione backup/primario, burn-in, dismissione.', inputs: 'AS-IS, TO-BE, vincoli', priority: 'Media', next: '→ MOP, Esecuzione' },
  { id: 'agent-vendor-translation', label: '🌐 Vendor Translation', desc: 'Cisco → Aethra/JunOS/Fortinet/Huawei. Analisi funzionale + equivalente nativo + delta comportamentale.', inputs: 'Config Cisco, target vendor', priority: 'Media', next: '→ CLI-templating' },
];

var AGENT_MAP = Object.fromEntries(AGENTS.map(function(a) { return [a.id, a]; }));

// ─── Agent Description Mapping ────────────────────────────────────────

function getAgentDescriptions() {
  return Object.fromEntries(AGENTS.map(function(a) { return [a.id, '**' + a.label + '** — ' + a.desc]; }));
}
