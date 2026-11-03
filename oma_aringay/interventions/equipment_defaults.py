"""The equipment names Crop Settings > Equipment Types and Fisheries Settings > Equipment Types start with: the ones the organization forms
have always offered (associations FarmersOrganizationEquipment / FisherfolkOrganizationEquipment `EquipmentName`, without "Other", which the
dropdowns add themselves). The data migration 0024 fills an empty list with them; after that the Admin owns the list, and the farmer Machinery
dropdown, the organization Equipment dropdown and the assistance Equipment dropdown all read it. A test keeps this file equal to the
organization forms' names."""

DEFAULT_EQUIPMENT = {
    'crop': (
        'Hand Tractor', 'Four-Wheel Tractor', 'Rice Thresher', 'Corn Sheller', 'Water Pump/Irrigation Pump', 'Knapsack Sprayer',
        'Power Sprayer', 'Rice Mill', 'Dryer', 'Storage Facility', 'Post-Harvest Equipment', 'Farm Tools (Shovel, Hoe, etc.)',
        'Harvesting Equipment', 'Seedling Tray', 'Greenhouse/Net House', 'Generator',
    ),
    'fisheries': (
        'Fishing Boat/Banca', 'Motorized Banca', 'Outboard Motor', 'Fish Cage', 'Fish Net (Gill Net)', 'Fish Net (Cast Net)',
        'Fish Net (Trawl Net)', 'Fishing Lines and Hooks', 'Fish Pond/Tank', 'Aerator/Air Pump', 'Water Pump', 'Life Vest/Safety Gear',
        'Ice Box/Cooler', 'Fish Weighing Scale', 'GPS/Navigation Equipment', 'Feeding Equipment', 'Harvesting Net', 'Generator',
    ),
}
