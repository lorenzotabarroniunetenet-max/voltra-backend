// Lore Voltra ufficiale — single source of truth lato backend
// Da non duplicare in altri file: importare sempre da qui.

export const GRADE_LORE = {
  Caporale: {
    rank: '🎖',
    mission: "L'Ultimo Avamposto",
    motto: 'Constantia ante omnia',
    mottoTranslation: 'La costanza prima di ogni cosa',
    codice: [
      'Eseguire con precisione il compito definito, prima di proporre alternative.',
      'Riportare al Comando ciò che si osserva, senza filtri e senza enfasi.',
      'Custodire la riservatezza del club come prima forma di lealtà.',
      'Studiare il proprio operato con onestà.',
      'Riconoscere che il proprio grado è un punto di partenza, non un limite.',
    ],
    story: 'La trincea è la sua casa. Il rumore della radio è il suo orologio. Il Caporale è il primo a salire e l\'ultimo a scendere — perché finché lui tiene la linea, il reparto resiste.',
  },
  Sergente: {
    rank: '⭐',
    mission: 'Il Messaggero',
    motto: 'Clarius, deinde firmius',
    mottoTranslation: 'Più chiaro, poi più fermo',
    codice: [
      'Trasmettere le direttive del Comando senza alterazione, ma con interpretazione lucida.',
      'Verificare due volte ciò che si sta per riportare.',
      'Sostenere i Caporali nei momenti di pressione, mai sostituirli.',
      'Identificare i propri errori prima che venga richiesto.',
      'Conoscere ogni regola operativa, perché chi comanda deve poter rispondere.',
    ],
    story: 'Tra il fuoco e il Comando, c\'è una sola figura: il Sergente. Porta gli ordini sotto il bombardamento, riporta le perdite senza emozione, tiene gli uomini saldi quando il fronte cede.',
  },
  Capitano: {
    rank: '🦅',
    mission: 'Le Acque Profonde',
    motto: 'Videre, deinde agere',
    mottoTranslation: 'Vedere, poi agire',
    codice: [
      'Definire l\'obiettivo prima di muoversi, e non muoversi senza obiettivo.',
      'Decidere nei tempi richiesti, anche quando l\'informazione è incompleta.',
      'Non delegare la responsabilità che si è accettata.',
      'Riferire al Comando con sintesi: fatti, valutazione, decisione.',
      'Riconoscere quando un\'operazione va sospesa, e farlo senza esitazione.',
    ],
    story: 'Si muove dove nessuno vede. Operazioni che non vengono mai dichiarate, missioni di cui nessuno scriverà la cronaca.',
  },
  Colonnello: {
    rank: '🎗',
    mission: "L'Ultima Linea",
    motto: 'Exemplo, non verbis',
    mottoTranslation: "Con l'esempio, non con le parole",
    codice: [
      'L\'esempio personale è il primo strumento di comando.',
      'Le proprie deviazioni dalla disciplina pesano dieci volte di più.',
      'Difendere i propri Capitani in pubblico, correggerli in privato.',
      'Non utilizzare il grado per ottenere ciò che si potrebbe ottenere con la ragione.',
      'Lasciare il club, quando arriverà il momento, in condizioni migliori di come lo si è trovato.',
    ],
    story: 'Non porta più il fucile. Non legge più i bollettini. Il Colonnello guarda la mappa intera e decide chi rischia, chi resta, chi avanza.',
  },
}

export const DECORATIONS = [
  { slug: 'stella-anzianita-bronzo', name: 'Stella di Anzianità — Bronzo', criterion: 'Conferita al compimento dei 100 giorni di servizio attivo continuativo.', iconKey: '🥉', rarity: 'common', autoTrigger: 'days:100' },
  { slug: 'stella-anzianita-argento', name: 'Stella di Anzianità — Argento', criterion: 'Conferita al compimento dei 365 giorni di servizio attivo continuativo.', iconKey: '🥈', rarity: 'uncommon', autoTrigger: 'days:365' },
  { slug: 'stella-anzianita-oro', name: 'Stella di Anzianità — Oro', criterion: 'Conferita al compimento dei 1000 giorni di servizio attivo continuativo.', iconKey: '🥇', rarity: 'rare', autoTrigger: 'days:1000' },
  { slug: 'croce-prima-linea', name: 'Croce di Prima Linea', criterion: 'Conferita al Caporale che ha svolto con esattezza i propri compiti nel primo trimestre.', iconKey: '✚', rarity: 'uncommon', autoTrigger: null },
  { slug: 'croce-comando-avanzato', name: 'Croce di Comando Avanzato', criterion: 'Conferita al Sergente per lucidità nella trasmissione delle direttive.', iconKey: '✚', rarity: 'uncommon', autoTrigger: null },
  { slug: 'stella-operazioni-speciali', name: 'Stella delle Operazioni Speciali', criterion: 'Conferita al Capitano per condotta autonoma di un\'operazione complessa.', iconKey: '★', rarity: 'rare', autoTrigger: null },
  { slug: 'ordine-comando-supremo', name: 'Ordine del Comando Supremo', criterion: 'Conferita al Colonnello per esempio personale duraturo. Non più di una assegnazione per anno solare.', iconKey: '⚜', rarity: 'legendary', autoTrigger: null },
  { slug: 'encomio-solenne', name: 'Encomio Solenne del Comando', criterion: 'Lode pubblica per atto specifico di particolare rilievo, pubblicata in Ordine del Giorno.', iconKey: '⊕', rarity: 'rare', autoTrigger: null },
  { slug: 'menzione-discrezione', name: 'Menzione di Discrezione', criterion: 'Onorificenza silenziosa — conferita senza pubblicazione in Albo d\'Onore.', iconKey: '◈', rarity: 'rare', autoTrigger: null },
  { slug: 'sigillo-fondatore', name: 'Sigillo del Fondatore', criterion: 'Onorificenza eccezionale, conferita una sola volta nella storia del club a ciascun membro che ne sia ritenuto degno.', iconKey: '✦', rarity: 'legendary', autoTrigger: null },
]

export function generateMatricola(userId) {
  return `VLT-${userId.slice(-4).toUpperCase()}`
}
