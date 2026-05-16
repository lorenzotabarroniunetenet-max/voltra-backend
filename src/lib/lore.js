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
  { slug: 'compiacimento', name: 'Compiacimento', criterion: 'Conferito al raggiungimento di 3 operazioni concluse.', iconKey: '◦', rarity: 'common', autoTrigger: 'purchases:3' },
  { slug: 'elogio', name: 'Elogio', criterion: 'Conferito al raggiungimento di 6 operazioni concluse.', iconKey: '◉', rarity: 'common', autoTrigger: 'purchases:6' },
  { slug: 'stella-bronzo', name: 'Stella di Bronzo', criterion: 'Conferita al raggiungimento di 15 operazioni concluse.', iconKey: '🥉', rarity: 'uncommon', autoTrigger: 'purchases:15' },
  { slug: 'encomio-semplice', name: 'Encomio Semplice', criterion: 'Conferito al raggiungimento di 17 operazioni concluse.', iconKey: '✚', rarity: 'uncommon', autoTrigger: 'purchases:17' },
  { slug: 'stella-argento', name: 'Stella di Argento', criterion: 'Conferita al raggiungimento di 30 operazioni concluse.', iconKey: '🥈', rarity: 'rare', autoTrigger: 'purchases:30' },
  { slug: 'encomio-solenne', name: 'Encomio Solenne', criterion: 'Conferito al raggiungimento di 40 operazioni concluse.', iconKey: '⊕', rarity: 'rare', autoTrigger: 'purchases:40' },
  { slug: 'stella-oro', name: 'Stella d\'Oro', criterion: 'Conferita al raggiungimento di 60 operazioni concluse.', iconKey: '🥇', rarity: 'legendary', autoTrigger: 'purchases:60' },
]

// Soglie ordinate per progressione visibile
export const PURCHASE_THRESHOLDS = [
  { slug: 'compiacimento', name: 'Compiacimento', threshold: 3, iconKey: '◦' },
  { slug: 'elogio', name: 'Elogio', threshold: 6, iconKey: '◉' },
  { slug: 'stella-bronzo', name: 'Stella di Bronzo', threshold: 15, iconKey: '🥉' },
  { slug: 'encomio-semplice', name: 'Encomio Semplice', threshold: 17, iconKey: '✚' },
  { slug: 'stella-argento', name: 'Stella di Argento', threshold: 30, iconKey: '🥈' },
  { slug: 'encomio-solenne', name: 'Encomio Solenne', threshold: 40, iconKey: '⊕' },
  { slug: 'stella-oro', name: 'Stella d\'Oro', threshold: 60, iconKey: '🥇' },
]

export function generateMatricola(userId) {
  return `VLT-${userId.slice(-4).toUpperCase()}`
}
