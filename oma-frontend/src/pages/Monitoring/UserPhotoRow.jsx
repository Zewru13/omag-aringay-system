import { forwardRef, useImperativeHandle } from 'react'
import PhotoListField from '../../components/UI/PhotoListField.jsx'
import usePhotoList from '../../hooks/usePhotoList.js'

// One row of the "Photo documentation per farmer" table of Log Disaster (Crop Disaster): a farmer who has a crop ticked, what of theirs is
// affected, and THEIR OWN photo list. The list lives in this row (usePhotoList), so it is theirs alone and goes away - previews released -
// the moment the farmer leaves the selection and the row unmounts. The screen asks the row for its photos when it saves (ref.photos()) and
// sends them as photos_<farmer id>.
const UserPhotoRow = forwardRef(function UserPhotoRow({ farmer }, ref) {
  const photosState = usePhotoList()
  useImperativeHandle(ref, () => ({ photos: () => photosState.photos }))
  const crops = `${farmer.crops} crop${farmer.crops === 1 ? '' : 's'}`
  const parcels = `${farmer.parcels} parcel${farmer.parcels === 1 ? '' : 's'}`
  return (
    <tr className="border-b border-[#F0F4F0] align-top last:border-b-0 max-md:block max-md:px-3 max-md:py-3" data-testid="farmer-photo-row" data-farmer-id={farmer.id}>
      <td className="px-3 py-3 md:w-[22%] max-md:block max-md:p-0">
        <p className="text-[13px] font-semibold text-[#1A2B1A]">{farmer.name}</p>
        <p className="text-[11.5px] text-[#7A8E7A]">{[farmer.rsbsa, farmer.barangay].filter(Boolean).join(' · ')}</p>
      </td>
      <td className="px-3 py-3 text-[12.5px] text-[#4A5E4A] md:w-[26%] max-md:mt-1 max-md:block max-md:p-0">
        <p>{parcels} · {crops}{farmer.total > 0 && <span className="text-rose-700"> · {farmer.total} total loss</span>}</p>
        <p className="mt-0.5 text-[11.5px] text-[#7A8E7A]">{farmer.parcelTitles.join(', ')}</p>
      </td>
      <td className="px-3 py-3 max-md:mt-2 max-md:block max-md:p-0">
        <PhotoListField photosState={photosState} compact title="" hint="" testId={`farmer-photos-${farmer.id}`}
          ownerLabel={farmer.name} altPrefix={`Damage photo of ${farmer.name}`}
          cameraSubtitle={`Photo of the damage for ${farmer.name}.`} />
      </td>
    </tr>
  )
})

export default UserPhotoRow
