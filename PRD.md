# DocSplitter — Product Requirements Document

> **Un file HTML singolo** che divide file PDF/DOCX con struttura a capitoli numerati in file `.txt` organizzati in cartelle gerarchiche.

**Versione:** v7.1
**Stato:** Stabile
**Creato:** 05/06/2026
**Ultimo aggiornamento:** 05/06/2026

---

## 1. Visione

DocSplitter nasce per estrarre da documenti tecnici (configurazioni Cisco IOS, manuali, specifiche) i singoli paragrafi/blocchi di testo e organizzarli in una struttura a cartelle che rispecchia la gerarchia delle intestazioni numerate del documento originale.

### Casi d'uso primari

- **Configurazioni Cisco con note a margine:** PDF con comandi config a sinistra e note/annotazioni a destra in formato tabellare, senza gutter visibile.
- **Documenti con struttura numerata profonda:** Es. `4.4.2 → 4.4.2.1 → 4.4.2.1.1 CPE` — ogni livello diventa una cartella o file.
- **Documenti multilingua / con placeholder tecnici:** `<INTERFACE>.<S-TAG-TAG>` che non devono essere troncati.

### Non obiettivi

- Non è un convertitore PDF→Word/Markdown generico.
- Non gestisce documenti scansionati (solo immagini).
- Non è un server — funziona 100% lato client.

---

## 2. Stack

| Componente | Tecnologia |
|------------|-----------|
| Runtime | Browser (client-side) |
| PDF | pdf.js 3.11.174 |
| DOCX | Mammoth.js 1.6.0 |
| ZIP | JSZip 3.10.1 |
| UI | Tailwind CSS (CDN) |
| Tipografia | DM Sans + JetBrains Mono (Google Fonts) |

---

## 3. Architettura

### Pipeline di elaborazione

```
PDF/DOCX
  │
  ▼
[processPdf / processDocx]
  │  Estrazione testo + font + coordinate
  │
  ▼
[Column detection]  ← solo PDF
  │  Separate left (config) da right (annotations)
  │  Strategia primaria: unique-Y cluster
  │  Fallback: within-line gap
  │
  ▼
[Line grouping + paragraph detection]
  │  Raggruppa righe contigue per pagina e gap verticale
  │
  ▼
[Merge left + right blocks]  ← merge ordinato
  │  Intercala blocchi sinistri e destri per posizione visiva
  │
  ▼
[buildSections]
  │  Divide in sezioni: ogni intestazione numerata o bold = nuova sezione
  │
  ▼
[mergeShortSections]
  │  Unisce sezioni brevi (<100 caratteri) con la sezione sorella successiva
  │
  ▼
[assignFileNames]
  │  Assegna cartelle/file in base alla gerarchia numerica
  │
  ▼
[generateZip]
  │  Crea ZIP con INDICE.txt e tutti i file nella struttura cartelle
```

### Variabili di configurazione

Definite in cima allo script (regolabili):

```javascript
const MERGE_MIN_CHARS = 100;   // Soglia per mergeShortSections
// Column detection (PDF):
const MERGE_THRESHOLD = 40;    // pt — unisce frammenti prima della detection
const MIN_GAP = 50;            // pt — gutter minimo per column split
```

---

## 4. Column Detection (PDF)

### Problema risolto

I PDF Cisco hanno configurazioni in una tabella senza gutter visibile tra colonna sinistra e destra. I placeholder tecnici lunghi (es. `<INTERFACE>.<S-TAG-TAG>`) creano gap interni che sembrano gutter, causando falsi positivi.

### Strategia Primaria — Unique-Y Cluster

1. Per ogni pagina, esamina gli item nella zona destra (40–90% della larghezza)
2. Raggruppa in bande X larghe 8pt e conta il numero di Y distinte per banda
3. La banda col maggior numero di Y distinte ≥ 3 è la colonna destra
4. Calcola gutter e split position al 50% del gutter

**Perché funziona:** Una vera colonna destra appare a tante Y diverse (una per riga di annotazione). Un falso positivo da placeholder lungo appare a una sola Y.

### Strategia Fallback — Within-line Gap

Attivata quando la primaria non trova cluster (es. poche annotazioni).

1. Trova gap intra-riga ≥ `MIN_GAP` (50pt) con item che iniziano oltre il 40% della pagina
2. Mediana dei right-start X, filtrata entro ±80pt
3. Split se sufficienti gap coerenti

### Pre-merge dei frammenti

Prima della column detection, gli item con gap orizzontale < `MERGE_THRESHOLD` (40pt) vengono uniti sulla stessa riga. Questo evita che placeholder composti come `<S-` + `TAG-TAG>` vengano scambiati per due colonne separate.

---

## 5. Annotations Handling (cambio architetturale chiave v7→v7.1)

### Problema originale (v6–v7)

Il sistema `sectionEndIdx()` confrontava le coordinate Y delle annotazioni (colonna destra) con quelle dei titoli (colonna sinistra) per decidere in quale sezione inserirle. Le Y di colonne diverse raramente coincidono — font, baseline e allineamento diversi nel PDF bastano a far sì che un'annotazione venga classificata "sopra" il titolo invece che "sotto", facendola finire nell'ultima sezione del documento.

### Soluzione v7.1 — Merge ordinato (mergeBlocks)

Sostituito `sectionEndIdx()` / `insertAfter[]` con un **merge standard di due liste ordinate**:

1. `leftBlocks` e `rightBlocks` sono entrambi ordinati: pagina crescente, Y decrescente (top→bottom)
2. Un merge `while (li < left.length && ri < right.length)` produce la sequenza visiva naturale
3. Ogni annotazione finisce tra i blocchi che le stanno intorno visivamente
4. `buildSections` le assegna alla sezione corrente, che è quella giusta per posizione nel flusso

```
Prima (sectionEndIdx):        left[Titolo, Config1, Config2, Titolo2, C3]
  right[Ann1, Ann2] → Y comparate ai titoli → mismatch → ultima sezione

Dopo (merge):                  left[Titolo, Config1, Config2, Titolo2, C3]
                               right[   Ann1,                Ann2]
  merged[Titolo, Config1, Ann1, Config2, Titolo2, Ann2, C3]
```

**Vantaggi:**
- Nessun confronto fragile di Y tra colonne diverse
- Le annotazioni appaiono nell'ordine visivo naturale
- Codice più semplice e manutenibile (−29 righe)

---

## 6. Section Building

### Riconoscimento titoli

Un blocco è un titolo (e quindi avvia una nuova sezione) se:

1. **Bold:** Il primo carattere del paragrafo è in grassetto (font name contiene "bold" OPPURE font height > 75° percentile × 1.35). Ratio del bold sul totale caratteri ≥ 65%.
2. **Numerato:** match regex `/^\d+(\.\d+)+\s/` — cattura anche intestazioni non in grassetto.

### cleanTitle

Il nome del file deriva dal titolo:
- Strip diacritici (NFD)
- Rimuove caratteri non alfanumerici/spazio/hyphen/dot
- Sostituisce spazi con underscore
- Tronca a 60 caratteri
- **Mantiene i punti** nel prefisso numerico (es. `4.4.2.1.1_CPE`)

### mergeShortSections

Sezioni con contenuto (esclusa riga titolo) < `MERGE_MIN_CHARS` (100) vengono fuse con la sezione successiva, ma SOLO se sono sorelle alla stessa profondità gerarchica.

**sameGroup()** — due titoli sono nello stesso gruppo se:
- Entrambi numerati: STESSO numero di livelli E STESSO genitore (es. `4.4.2.1` e `4.4.2.2`)
- Altrimenti: stesso top-level group number

---

## 7. Struttura Cartelle/File (assignFileNames)

### Logica gerarchica

```
4/                                   ← heading con figli → CARTELLA
  4.4/                               ← heading con figli → CARTELLA
    4.4.1                            ← heading foglia → FILE .txt
    4.4.2                            ← heading con figli → CARTELLA
      4.4.2.1                        ← heading con figli → CARTELLA
        4.4.2.1.1 CPE                ← heading foglia → FILE .txt
```

### Regole

| Tipo | Comportamento | Esempio |
|------|--------------|---------|
| Intestazione **con figli** (parent) | Crea cartella col suo nome, il suo contenuto va in un file `.txt` con lo stesso nome dentro la cartella | `4.4.2_Scenario_Z/4.4.2_Scenario_Z.txt` |
| Intestazione **foglia** | Crea file `.txt` dentro la cartella del genitore più prossimo | `4.4.2_Scenario_Z/4.4.2.1.1_CPE.txt` |
| Intestazione **non numerata** | File nella cartella dell'antenato numerato più recente | `4.4.2_Scenario_Z/ar50x.txt` |
| **Nessun titolo** (introduzione) | `00_Introduzione.txt` alla root | |

### ParseNumericPrefix

```
"4.4.2.1.1 CPE"  →  { numStr:"4.4.2.1.1", nums:[4,4,2,1,1], rest:"CPE" }
"ar50x"          →  null
```

### ComputeHierarchyInfo

Per ogni sezione numerata, determina se ha figli controllando se esiste un'altra sezione il cui prefisso inizia col suo prefisso + `.` .

---

## 8. ZIP Output

- **INDICE.txt** — file riassuntivo con nome originale, data, conteggio sezioni, elenco file con percorso gerarchico e conteggio parole
- **File `.txt`** — ogni sezione produce un file nella struttura cartelle definita da `assignFileNames`
- **Prefisso `!`** — ogni riga che inizia con `(` (footnote/annotazione) viene preposta con `! ` per compatibilità Cisco IOS

---

## 9. UI

- **Drop zone** — drag & drop o click per selezionare file
- **Progress bar** — feedback durante l'elaborazione PDF
- **Preview cards** — anteprima dei file generati con nome, percorso, parole e excerpt
- **Download ZIP** — pulsante per scaricare il pacchetto
- **100% locale** — nessun dato lascia il browser

---

## 10. Known Issues / Limitazioni

- **PDF scansionati:** nessun testo estraibile → errore
- **Colonna destra corta:** (< 3 righe Y distinte) la strategia primaria fallbacka alla within-line gap
- **DOCX:** solo elaborazione grassetto/heading (nessuna colonna destra)
- **Documenti senza intestazioni numerate:** usa solo grassetto come split

---

## 11. Storia Versioni

| Versione | Data | Modifiche |
|----------|------|-----------|
| v7.1 | 05/06/2026 | Sostituito `sectionEndIdx` Y-based con merge ordinato `mergeBlocks` per annotazioni |
| v7 | 05/06/2026 | `isHeading()` in `buildSections` per split su intestazioni numerate |
| v6.3 | — | Gerarchia cartelle/file in `assignFileNames` |
| v6.2 | — | `sameGroup` depth-aware |
| v6.1 | — | `cleanTitle` mantiene punti |
| v6 | — | Checkpoint iniziale: pre-merge + gap detection + fallback |

---

## 12. Deploy

Servito con **Caddy** su porta `:3001`, accesso limitato a LAN:

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

URL: `http://steamdeck:3001/`
