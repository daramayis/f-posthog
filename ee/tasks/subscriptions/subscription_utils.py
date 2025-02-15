from datetime import datetime, timedelta
from time import sleep
from typing import List, Tuple, Union

import structlog
from celery import group

from posthog.models.dashboard_tile import get_tiles_ordered_by_position
from posthog.models.exported_asset import ExportedAsset
from posthog.models.insight import Insight
from posthog.models.sharing_configuration import SharingConfiguration
from posthog.models.subscription import Subscription
from posthog.tasks import exporter

logger = structlog.get_logger(__name__)

UTM_TAGS_BASE = "utm_source=posthog&utm_campaign=subscription_report"
DEFAULT_MAX_ASSET_COUNT = 6
ASSET_GENERATION_MAX_TIMEOUT = timedelta(minutes=10)


def generate_assets(
    resource: Union[Subscription, SharingConfiguration], max_asset_count: int = DEFAULT_MAX_ASSET_COUNT
) -> Tuple[List[Insight], List[ExportedAsset]]:
    if resource.dashboard:
        tiles = get_tiles_ordered_by_position(resource.dashboard)
        insights = [tile.insight for tile in tiles if tile.insight]
    elif resource.insight:
        insights = [resource.insight]
    else:
        raise Exception("There are no insights to be sent for this Subscription")

    # Create all the assets we need
    assets = [
        ExportedAsset(team=resource.team, export_format="image/png", insight=insight, dashboard=resource.dashboard)
        for insight in insights[:max_asset_count]
    ]
    ExportedAsset.objects.bulk_create(assets)

    # Wait for all assets to be exported
    tasks = [exporter.export_asset.s(asset.id) for asset in assets]
    parallel_job = group(tasks).apply_async()

    start_time = datetime.now()
    while not parallel_job.ready():
        sleep(1)
        if datetime.now() > start_time + ASSET_GENERATION_MAX_TIMEOUT:
            raise Exception("Timed out waiting for exports")

    return insights, assets
