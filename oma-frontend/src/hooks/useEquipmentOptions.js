import useAssistanceChoices from '../pages/AssistanceManagement/useAssistanceChoices.js'
import { equipmentOptions } from '../utils/equipmentNames.js'

// The names of an equipment dropdown: `domain` is 'crop' (farmers) or 'fisheries' (fisherfolk), `builtIn` the list used until Settings has one.
export default function useEquipmentOptions(domain, builtIn) {
  const choices = useAssistanceChoices(domain)
  return equipmentOptions(choices?.equipment, builtIn)
}
