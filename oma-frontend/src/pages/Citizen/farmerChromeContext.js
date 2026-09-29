import { createContext } from 'react'

// Provided by FarmerHomeScreen; read by citizenUI's header components so they
// render FarmerHeader (see FarmerChrome.jsx). null everywhere else.
export const FarmerChromeContext = createContext(null)
