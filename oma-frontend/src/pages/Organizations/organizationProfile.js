// The rules of the organization profile screen. No screen and no network, so they can be tested alone.

// The street and the barangay as one line ("Purok 3, Alaska").
export const addressText = (organization) => [organization?.street_address, organization?.barangay].filter(Boolean).join(', ')
