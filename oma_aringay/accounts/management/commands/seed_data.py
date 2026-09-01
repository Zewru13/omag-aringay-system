from django.core.management.base import BaseCommand
from accounts.models import User
from farmers.models import Farmer, FarmParcel
from fisheries.models import Fisherfolk, AquacultureRecord, CaptureRecord
from production.models import HarvestRecord


class Command(BaseCommand):
    help = 'Seed the database with sample data for testing'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting seed data creation...'))

        # Create users
        self.create_users()

        # Create farmers
        farmers = self.create_farmers()

        # Create fisherfolk
        self.create_fisherfolk()

        # Create harvest records
        self.create_harvest_records(farmers)

        self.stdout.write(self.style.SUCCESS('Seed data created successfully!'))

    def create_users(self):
        """Create admin and evaluator users"""
        # Admin user
        admin_email = 'admin@omaaringay.gov.ph'
        if not User.objects.filter(email=admin_email).exists():
            User.objects.create_user(
                username=admin_email,
                email=admin_email,
                password='Admin1234',
                full_name='Administrator',
                role='ADMIN',
                is_active=True,
            )
            self.stdout.write(self.style.SUCCESS('✓ Admin user created (admin@omaaringay.gov.ph / Admin1234)'))
        else:
            self.stdout.write('  Admin user already exists, skipping')

        # Evaluator user
        eval_email = 'evaluator@omaaringay.gov.ph'
        if not User.objects.filter(email=eval_email).exists():
            User.objects.create_user(
                username=eval_email,
                email=eval_email,
                password='Eval1234',
                full_name='Evaluator',
                role='EVALUATOR',
                is_active=True,
            )
            self.stdout.write(self.style.SUCCESS('✓ Evaluator user created (evaluator@omaaringay.gov.ph / Eval1234)'))
        else:
            self.stdout.write('  Evaluator user already exists, skipping')

    def create_farmers(self):
        """Create 5 sample farmers with farm parcels"""
        farmer_data = [
            {
                'rsbsa_number': 'RSBSA-001-2024',
                'full_name': 'Juan Dela Cruz',
                'barangay': 'Damortis',
                'gender': 'Male',
                'date_of_birth': '1980-05-15',
                'contact_number': '09175551234',
                'parcel_location': 'Damortis East',
                'parcel_area': 2.5,
                'commodity': 'Rice',
            },
            {
                'rsbsa_number': 'RSBSA-002-2024',
                'full_name': 'Maria Santos',
                'barangay': 'Bolwan',
                'gender': 'Female',
                'date_of_birth': '1985-03-20',
                'contact_number': '09185552345',
                'parcel_location': 'Bolwan North',
                'parcel_area': 1.8,
                'commodity': 'Corn',
            },
            {
                'rsbsa_number': 'RSBSA-003-2024',
                'full_name': 'Pedro Rodriguez',
                'barangay': 'Tabuc',
                'gender': 'Male',
                'date_of_birth': '1975-07-10',
                'contact_number': '09165553456',
                'parcel_location': 'Tabuc Central',
                'parcel_area': 3.0,
                'commodity': 'Peanuts',
            },
            {
                'rsbsa_number': 'RSBSA-004-2024',
                'full_name': 'Rosa Gonzales',
                'barangay': 'Santo Domingo',
                'gender': 'Female',
                'date_of_birth': '1982-11-25',
                'contact_number': '09155554567',
                'parcel_location': 'Santo Domingo West',
                'parcel_area': 2.2,
                'commodity': 'Vegetables',
            },
            {
                'rsbsa_number': 'RSBSA-005-2024',
                'full_name': 'Antonio Villanueva',
                'barangay': 'Ilog',
                'gender': 'Male',
                'date_of_birth': '1978-09-08',
                'contact_number': '09145555678',
                'parcel_location': 'Ilog South',
                'parcel_area': 2.8,
                'commodity': 'Sweet Potato',
            },
        ]

        farmers = []
        for data in farmer_data:
            if not Farmer.objects.filter(rsbsa_number=data['rsbsa_number']).exists():
                farmer = Farmer.objects.create(
                    rsbsa_number=data['rsbsa_number'],
                    full_name=data['full_name'],
                    barangay=data['barangay'],
                    gender=data['gender'],
                    date_of_birth=data['date_of_birth'],
                    contact_number=data['contact_number'],
                    status='Active',
                )

                # Create farm parcel
                FarmParcel.objects.create(
                    farmer=farmer,
                    location=data['parcel_location'],
                    area=data['parcel_area'],
                    commodity=data['commodity'],
                )

                farmers.append(farmer)
                self.stdout.write(
                    self.style.SUCCESS(f'✓ Farmer created: {data["full_name"]}'
                    )
                )
            else:
                farmer = Farmer.objects.get(rsbsa_number=data['rsbsa_number'])
                farmers.append(farmer)
                self.stdout.write(f'  Farmer already exists: {data["full_name"]}, skipping')

        return farmers

    def create_fisherfolk(self):
        """Create 2 sample fisherfolk: 1 Aquaculture, 1 Capture"""
        # Aquaculture fisherfolk
        if not Fisherfolk.objects.filter(lgu_registration_number='LGU-FISH-001').exists():
            fisherfolk1 = Fisherfolk.objects.create(
                lgu_registration_number='LGU-FISH-001',
                full_name='Marcelino Santos',
                gender='Male',
                date_of_birth='1980-04-12',
                contact_number='09175551111',
                barangay='Bolwan',
                fisherfolk_type='aquaculture',
                status='Active',
            )

            AquacultureRecord.objects.create(
                fisherfolk=fisherfolk1,
                culture_type='fish_cage',
                species='Tilapia',
                area=0.5,
                fingerlings_stocked=5000,
            )

            self.stdout.write(self.style.SUCCESS('✓ Aquaculture fisherfolk created'))
        else:
            self.stdout.write('  Aquaculture fisherfolk already exists, skipping')

        # Capture fisherfolk
        if not Fisherfolk.objects.filter(lgu_registration_number='LGU-FISH-002').exists():
            fisherfolk2 = Fisherfolk.objects.create(
                lgu_registration_number='LGU-FISH-002',
                full_name='Roberto Lara',
                gender='Male',
                date_of_birth='1975-06-20',
                contact_number='09175552222',
                barangay='Damortis',
                fisherfolk_type='capture',
                status='Active',
            )

            CaptureRecord.objects.create(
                fisherfolk=fisherfolk2,
                vessel_type='motorized',
                vessel_registration_number='VESSEL-001',
                gear_type='Gill Net',
                fishing_ground='Lingayen Gulf',
            )

            self.stdout.write(self.style.SUCCESS('✓ Capture fisherfolk created'))
        else:
            self.stdout.write('  Capture fisherfolk already exists, skipping')

    def create_harvest_records(self, farmers):
        """Create 2 sample harvest records"""
        if not HarvestRecord.objects.filter(crop_name='Rice Harvest June 2024').exists():
            if farmers and len(farmers) > 0:
                farmer = farmers[0]
                parcel = farmer.parcels.first()

                if parcel:
                    HarvestRecord.objects.create(
                        farmer=farmer,
                        parcel=parcel,
                        season='Dry',
                        year=2024,
                        crop_name='Rice Harvest June 2024',
                        area_harvested=2.5,
                        volume_kg=12500,
                        volume_bags=250,
                        price_per_kg=25.50,
                    )

                    self.stdout.write(self.style.SUCCESS('✓ First harvest record created'))

        if not HarvestRecord.objects.filter(crop_name='Corn Harvest August 2024').exists():
            if farmers and len(farmers) > 1:
                farmer = farmers[1]
                parcel = farmer.parcels.first()

                if parcel:
                    HarvestRecord.objects.create(
                        farmer=farmer,
                        parcel=parcel,
                        season='Dry',
                        year=2024,
                        crop_name='Corn Harvest August 2024',
                        area_harvested=1.8,
                        volume_kg=9000,
                        volume_bags=180,
                        price_per_kg=18.75,
                    )

                    self.stdout.write(self.style.SUCCESS('✓ Second harvest record created'))
        else:
            self.stdout.write('  Harvest records already exist, skipping')
