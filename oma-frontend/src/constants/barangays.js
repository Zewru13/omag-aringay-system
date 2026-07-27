export const ARINGAY_BARANGAYS = [
  'Alaska',
  'Basca',
  'Dulao',
  'Gallano',
  'Macabato',
  'Manga',
  'Pangao-aoan East',
  'Pangao-aoan West',
  'Poblacion',
  'Samara',
  'San Antonio',
  'San Benito Norte',
  'San Benito Sur',
  'San Eugenio',
  'San Juan East',
  'San Juan West',
  'San Simon East',
  'San Simon West',
  'Santa Cecilia',
  'Santa Lucia',
  'Santa Rita East',
  'Santa Rita West',
  'Santo Rosario East',
  'Santo Rosario West',
]

// CONFIRMED mapping — barangay -> 3-digit RSBSA barangay code. Source: the
// real RSBSA/BFAR registry import (Batch 8, 2026-07-27), cross-referencing
// each row's actual rsbsa_no barangay-code segment against its
// farmer_address_bgy across 4,410 clean (non-corrupted) imported records.
// Confirmed correct and replaced the old provisional alphabetical 1-24
// sequential guess in Batch 9 (2026-07-27). Mirrors core/constants.py
// BARANGAY_RSBSA_CODES on the backend — this frontend copy does NOT read it
// dynamically, so any future correction must be applied in both places.
//
// Codes 008, 013, 017, and 026 do not appear anywhere in the source data and
// are deliberately absent here rather than guessed — they may belong to
// barangays outside Aringay's own RSBSA scope.
export const BARANGAY_RSBSA_CODES = {
  'Alaska':              '001',
  'Basca':               '002',
  'Dulao':               '003',
  'Gallano':             '004',
  'Macabato':            '005',
  'Manga':               '006',
  'Pangao-aoan East':    '007',
  'Pangao-aoan West':    '009',
  'Poblacion':           '010',
  'Samara':              '011',
  'San Antonio':         '012',
  'San Benito Norte':    '014',
  'San Benito Sur':      '015',
  'San Eugenio':         '016',
  'San Juan East':       '018',
  'San Juan West':       '019',
  'San Simon East':      '020',
  'San Simon West':      '021',
  'Santa Cecilia':       '022',
  'Santa Lucia':         '023',
  'Santa Rita East':     '024',
  'Santa Rita West':     '025',
  'Santo Rosario East':  '027',
  'Santo Rosario West':  '028',
}

export default ARINGAY_BARANGAYS
