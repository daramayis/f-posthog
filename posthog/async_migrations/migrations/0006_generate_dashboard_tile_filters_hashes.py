from functools import cached_property
from typing import List

import structlog
from sentry_sdk import capture_exception

from posthog.async_migrations.definition import AsyncMigrationDefinition, AsyncMigrationOperation, AsyncMigrationType
from posthog.models.dashboard_tile import DashboardTile
from posthog.models.insight import generate_insight_cache_key
from posthog.redis import get_client

logger = structlog.get_logger(__name__)

REDIS_HIGHWATERMARK_KEY = "posthog.async_migrations.0006.highwatermark"


class Migration(AsyncMigrationDefinition):
    description = "ensure all dashboard tiles have filters hashes"

    depends_on = "0005_person_replacing_by_version"

    def is_required(self) -> bool:
        hashless_tiles = DashboardTile.objects.filter(filters_hash=None)
        is_required = hashless_tiles.count() > 0
        logger.info("0006_async_migration.checking_if_required", count=hashless_tiles.count(), is_required=is_required)
        return is_required

    @cached_property
    def operations(self):
        return [
            AsyncMigrationOperation(fn=self.set_high_watermark),
            AsyncMigrationOperation(fn=self.set_filters_hashes),
            AsyncMigrationOperation(fn=self.unset_high_watermark),
        ]

    def set_filters_hashes(self, query_id: str) -> None:
        try:
            should_continue = True
            while should_continue:
                should_continue = self.set_page_of_filters_hashes()
        except Exception as err:
            logger.error("0006_async_migration.error_setting_filters_hashes", exc=err, exc_info=True)
            capture_exception(err)

    def set_page_of_filters_hashes(self) -> bool:
        tiles_with_no_hash = (
            DashboardTile.objects.filter(filters_hash=None).select_related("insight", "dashboard").order_by("id")
        )
        logger.debug("0006_async_migration.processing_a_page", count=tiles_with_no_hash.count())
        updated_tiles: List[DashboardTile] = []
        if tiles_with_no_hash.count() > 0:
            for tile in tiles_with_no_hash[0:100]:
                # generate_insight_cache_key takes 2-5 seconds with peaks above that
                tile.filters_hash = generate_insight_cache_key(tile.insight, tile.dashboard)
                updated_tiles.append(tile)

            logger.info("0006_async_migration.updating_tiles", count=updated_tiles.count())
            DashboardTile.objects.bulk_update(updated_tiles, ["filters_hash"])

            return True

        return False

    def get_high_watermark(self) -> int:
        high_watermark = get_client().get(REDIS_HIGHWATERMARK_KEY)
        return int(high_watermark) if high_watermark is not None else 0

    def set_high_watermark(self, query_id: str) -> None:
        if not self.get_high_watermark():
            count_of_tiles_without_filters_hash = DashboardTile.objects.filter(filters_hash=None).count()
            logger.debug("0006_async_migration.setting_high_watermark", count=count_of_tiles_without_filters_hash)
            get_client().set(REDIS_HIGHWATERMARK_KEY, count_of_tiles_without_filters_hash)

    def unset_high_watermark(self, query_id: str) -> None:
        get_client().delete(REDIS_HIGHWATERMARK_KEY)

    def progress(self, migration_instance: AsyncMigrationType) -> int:
        current_count = DashboardTile.objects.filter(filters_hash=None).count()
        starting_count = self.get_high_watermark()
        return int((current_count / starting_count) * 100)