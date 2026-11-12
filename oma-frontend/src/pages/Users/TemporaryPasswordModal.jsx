import { KeyRound } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import CopyLine from './CopyLine.jsx'

// Shown ONLY when a temporary password could not be e-mailed: the administrator is given it once, to pass on in person.
// (When the e-mail is sent, the password is never shown anywhere.)
//   outcome: { title, reason, password, link, email } from staffPasswordOutcome.js

export default function TemporaryPasswordModal({ outcome, onClose }) {
  return (
    <ModalShell
      title={outcome.title}
      subtitle="The e-mail could not be sent"
      icon={KeyRound}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={<Button type="button" onClick={onClose}>Done</Button>}
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-[#FDE68A] bg-[#FEF3C7] px-4 py-3 text-[12px] text-[#92400E]">
          The e-mail to {outcome.email} could not be sent{outcome.reason ? ` (${outcome.reason.replace(/[.\s]+$/, '')})` : ''}. Give them these details
          yourself.
        </div>
        <FormSection title="Details to give them">
          <FormRows label="Details to give them">
            <FormRow>
              <FormCell label="Temporary Password (shown once)" wide>
                <CopyLine label="Temporary password" value={outcome.password} />
              </FormCell>
            </FormRow>
            {outcome.link && (
              <FormRow>
                <FormCell label="Verification Link (shown once)" wide>
                  <CopyLine label="Verification link" value={outcome.link} mono="text-[11px]" />
                </FormCell>
              </FormRow>
            )}
          </FormRows>
        </FormSection>
        <p className="text-[11px] text-[#7A8E7A]">
          They sign in with this password and are asked to choose their own. Their earlier password no longer works. It is
          not shown again after you close this.
        </p>
      </div>
    </ModalShell>
  )
}
