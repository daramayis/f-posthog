import time
from functools import lru_cache
from typing import List, Optional

from rest_framework.throttling import SimpleRateThrottle
from sentry_sdk.api import capture_exception

from posthog.internal_metrics import incr
from posthog.models.instance_setting import get_instance_setting
from posthog.settings.utils import get_from_env, get_list, str_to_bool


@lru_cache(maxsize=1)
def get_team_allow_list(_ttl: int) -> List[str]:
    """
    The "allow list" will change way less frequently than it will be called
    _ttl is passed an infrequently changing value to ensure the cache is invalidated after some delay
    """
    return get_list(get_instance_setting("RATE_LIMITING_ALLOW_LIST_TEAMS"))


class PassThroughTeamRateThrottle(SimpleRateThrottle):
    def rate_limit_enabled(self):
        return get_from_env("RATE_LIMIT_ENABLED", False, type_cast=str_to_bool)

    @staticmethod
    def safely_get_team_id_from_view(view):
        """
        Gets the team_id from a view without throwing.

        Not all views have a team_id (e.g. the /organization endpoints),
        and accessing it when it does not exist throws a KeyError. Hence, this method.
        """
        try:
            return getattr(view, "team_id", None)
        except KeyError:
            return None

    def allow_request(self, request, view):
        if not self.rate_limit_enabled():
            return True

        # As we're figuring out what our throttle limits should be, we don't actually want to throttle anything.
        # Instead of throttling, this logs that the request would have been throttled.
        request_would_be_allowed = super().allow_request(request, view)
        if not request_would_be_allowed:
            try:
                team_id = self.safely_get_team_id_from_view(view)
                if self.team_is_allowed_to_bypass_throttle(team_id):
                    incr(
                        "team_allowed_to_bypass_rate_limit_exceeded",
                        tags={
                            "team_id": team_id,
                        },
                    )
                else:
                    scope = getattr(self, "scope", None)
                    rate = getattr(self, "rate", None)
                    incr(
                        "rate_limit_exceeded",
                        tags={"team_id": team_id, "scope": scope, "rate": rate},
                    )
            except Exception as e:
                capture_exception(e)
        return True

    def get_cache_key(self, request, view):
        """
        Attempts to throttle based on the team_id of the request. If it can't do that, it falls back to the user_id.
        And then finally to the IP address.
        """
        ident = None
        if request.user.is_authenticated:
            try:
                team_id = self.safely_get_team_id_from_view(view)
                if team_id:
                    ident = team_id
                else:
                    ident = request.user.pk
            except Exception as e:
                capture_exception(e)
                ident = self.get_ident(request)
        else:
            ident = self.get_ident(request)

        return self.cache_format % {"scope": self.scope, "ident": ident}

    def team_is_allowed_to_bypass_throttle(self, team_id: Optional[int]) -> bool:
        allow_list = get_team_allow_list(round(time.time() / 60))
        return team_id is not None and str(team_id) in allow_list


class PassThroughBurstRateThrottle(PassThroughTeamRateThrottle):
    # Throttle class that's applied on all endpoints (except for capture + decide)
    # Intended to block quick bursts of requests
    scope = "burst"
    rate = "480/minute"


class PassThroughSustainedRateThrottle(PassThroughTeamRateThrottle):
    # Throttle class that's applied on all endpoints (except for capture + decide)
    # Intended to block slower but sustained bursts of requests
    scope = "sustained"
    rate = "4800/hour"


class PassThroughClickHouseBurstRateThrottle(PassThroughTeamRateThrottle):
    # Throttle class that's a bit more aggressive and is used specifically
    # on endpoints that generally hit ClickHouse
    # Intended to block quick bursts of requests
    scope = "clickhouse_burst"
    rate = "240/minute"


class PassThroughClickHouseSustainedRateThrottle(PassThroughTeamRateThrottle):
    # Throttle class that's a bit more aggressive and is used specifically
    # on endpoints that generally hit ClickHouse
    # Intended to block slower but sustained bursts of requests
    scope = "clickhouse_sustained"
    rate = "1200/hour"
