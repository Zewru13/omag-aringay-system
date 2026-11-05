// Every registered fisherfolk is Aquaculture. The server saves a blank or "Unspecified" (Not Yet Classified) type as Aquaculture, and a
// record that still carries one of those is shown as Aquaculture too. A real type (Capture, Inland, Mariculture) is shown as it is.
export const displayFisherfolkType = (type) => (!type || type === 'Unspecified' ? 'Aquaculture' : type)
