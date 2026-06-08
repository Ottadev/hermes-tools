# DocJoiner — Product Requirements Document

> **Un file HTML singolo** che unisce file `.txt` selezionati da uno ZIP in un unico file di contesto, in formato TXT o Markdown.

**Versione:** 1.0
**Stato:** Stabile
**Creato:** 10/06/2026
**Ultimo aggiornamento:** 10/06/2026

---

## 1. Visione

DocJoiner è il complemento naturale di DocSplitter. Mentre DocSplitter divide un PDF in tanti piccoli file organizzati in cartelle, DocJoiner permette di **selezionare solo i file rilevanti** da quello ZIP e fonderli in un unico file, pronto per essere usato come contesto per agenti AI o come documentazione consultabile.

### Casi d'uso primari

- **Selezionare solo le sezioni rilevanti** da un documento tecnico di 200+ pagine per creare un contesto mirato
- **Unire configurazioni Cisco** da vari capitoli in un singolo file da passare come contesto ad agenti AI
- **Generare documentazione in formato Markdown** con struttura leggibile per repository o wiki

### Non obiettivi

- Non modifica il contenuto dei file
- Non è un editor
- Non gestisce formati diversi da `.txt` dentro ZIP

---

## 2. Stack

| Componente | Tecnologia |
|---|---|
| Runtime | Browser (client-side) |
| ZIP | JSZip 3.10.1 |
| UI | Tailwind CSS (CDN) |
| Tipografia | DM Sans + JetBrains Mono (Google Fonts) |

---

## 3. Architettura

### Pipeline di elaborazione

```
ZIP
  │
  ▼
[Caricamento ZIP con JSZip]
  │  Legge tutti i file .txt dall'archivio
  │
  ▼
[Costruzione albero]
  │  Converte i path flat in struttura gerarchica
  │  Ordina: cartelle prima, poi alfabetico
  │
  ▼
[Rendering albero con checkbox]
  │  Ogni cartella: chevron per expand/collapse
  │  Cartelle: checkbox con stato (tutto/parziale/nessuno)
  │  File: checkbox singola
  │
  ▼
[Selezione utente]
  │  Seleziona/deseleziona file o intere cartelle
  │  Pulsanti "Seleziona tutto" / "Deseleziona"
  │
  ▼
[Generazione output]
  │  TXT: separatori ═══ con [N] path
  │  MD: ## titoli + ``` code block
  │
  ▼
[Download file unico]
```

### Funzioni chiave

| Funzione | Ruolo |
|---|---|
| `buildTreeData()` | Converte flat path in albero nidificato, ordina cartelle/file |
| `getFolderState()` | Determina se cartella è tutta selezionata, parziale o nessuna |
| `collectChecked()` | Raccoglie i path dei file selezionati (attraversa sempre) |
| `renderTree()` | Rendering ricorsivo dell'albero con checkbox, chevron, badge |
| `generateOutput()` | Produce il file unico in formato TXT o MD |

---

## 4. Albero di Selezione

### Struttura

```
4/
  ☐ 4.4/
    ☐ 4.4.1_BGP/
      ☐ 4.4.1_BGP.txt        (245 parole)
    ☑ 4.4.2_Scenario_Z/        ← parziale (trattino)
      ☑ 4.4.2_Scenario_Z.txt  (80.000 parole)
      ☑ 4.4.2.1_Internet/
        ☑ 4.4.2.1.1_CPE.txt   (1.200 parole)
```

### Comportamento checkbox

| Azione | Risultato |
|---|---|
| Spunta cartella | Seleziona TUTTI i file al suo interno |
| Spunta file singolo | Seleziona solo quel file |
| Deseleziona cartella | Deseleziona TUTTI i file al suo interno |
| Cartella con selezione mista | Checkbox in stato **indeterminato** (trattino) |
| Clic su riga cartella | Expand/collapse contenuto |
| Clic su riga file | Toggle checkbox |

### Regole di raccolta

- `collectChecked()` attraversa **sempre** tutte le cartelle, indipendentemente dallo stato del genitore
- Controlla direttamente lo `checked` di ogni file foglia
- Questo permette di selezionare un sotto-albero anche se il genitore è deselezionato

---

## 5. Output

### Formato TXT

```
═══════════════════════════════════════
  CONTESTO UNIFICATO
  File originale : config_split.zip
  Sezioni incluse: 12
═══════════════════════════════════════

───────────────────────────────────────
  [01] 4.4.1_BGP/4.4.1_BGP.txt
───────────────────────────────────────
[contenuto...]

───────────────────────────────────────
  [02] 4.4.2_Scenario_Z/4.4.2_Scenario_Z.txt
───────────────────────────────────────
[contenuto...]

═══════════════════════════════════════
  FINE DOCUMENTO — 12 sezioni
═══════════════════════════════════════
```

### Formato Markdown

```markdown
# Contesto unificato

> **File originale:** `config_split.zip`
> **Sezioni incluse:** 12

---

## 01. `4.4.1_BGP/4.4.1_BGP.txt`

```
bgp 65000
 neighbor 10.0.0.1 remote-as 65001
```

---

*Fine del documento — 12 sezioni*
```

---

## 6. UI

- Drop zone drag & drop per ZIP
- Status + progress bar durante il caricamento
- Albero con scroll (max-height 420px)
- Badge conteggio "selezionati/totali" per ogni cartella
- Statistiche: N file selezionati, KB totali
- Pulsanti Seleziona tutto / Deseleziona
- Format picker TXT / MD
- Download button (disabilitato se 0 file selezionati)
- Tema scuro persistente (localStorage)
- 100% locale

---

## 7. Known Issues / Limitazioni

- **Caricamento ZIP grandi:** l'intero ZIP viene letto in memoria — file molto grandi (>100MB) potrebbero essere lenti
- **Solo .txt:** altri formati dentro lo ZIP vengono ignorati
- **Ri-render completo:** ogni cambio checkbox ri-rende l'intero albero (accettabile per alberi di centinaia di nodi)
- **INDICE.txt non filtrato:** viene mostrato nell'albero ma può essere deselezionato manualmente

---

## 8. Storia Versioni

| Versione | Data | Modifiche |
|---|---|---|
| **1.1** | 08/06/2026 | Aggiunto `runConsistencyCheck()` — verifica che tutti i file selezionati abbiano contenuto, mostra warning visivo in caso di mismatch. Tema scuro come default assoluto + knob sincronizzato. |

---

## 9. Deploy

Servito con **Caddy** su porta `:3001`, stesso dominio di DocSplitter:

```caddyfile
:3001 {
    bind 192.168.1.210
    root * /home/deck/Progetti/Tools
    file_server
    @internal {
        remote_ip 192.168.1.0/24
    }
}
```

URL: `http://steamdeck:3001/DocJoiner-dev.html`
