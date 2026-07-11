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

// PROVISIONAL mapping — barangay -> 3-digit RSBSA barangay code, assigned
// 001-024 in the same alphabetical order as ARINGAY_BARANGAYS above. This has
// NOT been verified against the real BFAR/DA RSBSA barangay code registry
// and must be confirmed by the client before relying on it for official use.
// Mirrors core/constants.py BARANGAY_RSBSA_CODES on the backend.
export const BARANGAY_RSBSA_CODES = ARINGAY_BARANGAYS.reduce((acc, name, i) => {
  acc[name] = String(i + 1).padStart(3, '0')
  return acc
}, {})

export default ARINGAY_BARANGAYS
