from django.db import migrations


class Migration(migrations.Migration):

    dependencies = []

    operations = [
        migrations.RunSQL(
            sql="""
                DROP TABLE IF EXISTS infrastructure_communitymachineryinventory;
                DROP TABLE IF EXISTS infrastructure_communitylivestockinventory;
                DROP TABLE IF EXISTS infrastructure_postharvestfacility;
                DROP TABLE IF EXISTS infrastructure_farmtomarketroad;
                DROP TABLE IF EXISTS infrastructure_irrigationfacility;
            """,
            reverse_sql="",
        ),
    ]
