import AccountProfilePage from '../Account/AccountProfilePage.jsx'

// /my-profile is shared by the citizen accounts that use the Admin pages for their own records:
// the organization, farmer or fisherfolk version is chosen from who is signed in (the route guard already admitted only those).
// One profile for every kind of account (pages/Account/AccountProfilePage.jsx).
export function OwnProfilePage() {
  return <AccountProfilePage />
}
