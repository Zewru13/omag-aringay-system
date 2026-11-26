import logo from '../../assets/LOGO OMAg-small.png'
import { SYSTEM_TITLE_READABLE } from '../../constants/appInfo.js'

// The card of the pages outside the system (forgot password, reset password, verify email, forced password change):
// the seal and the system's full title first, then the page's own content.
export default function AuthCard({ children }) {
  return (
    <div className="min-h-dvh bg-[#f0fdf4] flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl shadow-lg px-6 py-8 sm:px-10 w-full max-w-md">
        <img src={logo} alt="" className="w-24 h-24 object-contain mx-auto mb-3" />
        <p className="text-balance text-center text-[16px] font-bold leading-snug text-[#163318]">{SYSTEM_TITLE_READABLE}</p>
        <div className="mt-6 border-t border-slate-100 pt-6">{children}</div>
      </div>
    </div>
  )
}
