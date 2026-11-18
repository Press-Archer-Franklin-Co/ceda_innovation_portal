from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0006_add_leadership_card'),
    ]

    operations = [
        migrations.AddField(
            model_name='sitesettings',
            name='prize_money_label',
            field=models.CharField(
                blank=True, default='', max_length=50,
                help_text='Override label for prize money stat, e.g. "BWP 1.2M+". Leave blank to hide.',
            ),
        ),
        migrations.AddField(
            model_name='sitesettings',
            name='solutions_deployed',
            field=models.PositiveIntegerField(
                default=0,
                help_text='Number of solutions deployed (manual override shown on public site).',
            ),
        ),
    ]
