import os
from pathlib import Path

# Global Workspace Configuration Paths
WORKSPACE_DIR = Path(__file__).parent.parent.resolve()
DEFAULT_OUTPUT_DIR = WORKSPACE_DIR / "assets" / "rust_icons"

# Steam App ID mapping
STEAM_APP_IDS = {
    "rust": "252490",
    "aim lab": "714010",
    "aimlab": "714010",
    "car mechanic simulator 2021": "1190000",
    "carmechanicsimulator2021": "1190000",
    "valheim": "892970",
    "phasmophobia": "739630",
    "cuphead": "268910",
    "hollow knight": "367520",
    "hollowknight": "367520",
    "7 days to die": "251570",
    "7daystodie": "251570",
    "cities skylines": "255710",
    "citiesskylines": "255710",
    "subnautica": "264710",
    "the forest": "242760",
    "theforest": "242760",
    "unturned": "304930",
    "v rising": "1604030",
    "vrising": "1604030",
    "risk of rain 2": "632360",
    "riskofrain2": "632360"
}

# Category to directory mapping
CATEGORY_FOLDER_MAP = {
    "Weapon": "weapons",
    "Attire": "attire",
    "Construction": "construction",
    "Tool": "tools",
    "Food": "food",
    "Resources": "resources",
    "Component": "components",
    "Electrical": "electrical",
    "Medical": "medical",
    "Traps": "traps",
    "Ammunition": "ammunition",
    "Items": "items",
    "Fun": "fun",
    "Misc": "misc",
    "Seeds & Plants": "seeds_plants",
    "Custom Crosshairs": "custom_crosshairs",
    "Playlist Icons": "playlist_icons",
    "Academy Tasks": "academy_tasks",
    "Bots": "bots",
    "Rivals Tasks": "rivals_tasks"
}

# Seeds and plants category logic
SEEDS_PLANTS_SHORTNAME_PREFIXES = (
    "seed.",
    "clone.",
    "plantfiber",
    "planter.",
    "plantpot",
    "rail.road.planter",
    "triangle.rail.road.planter",
    "bathtub.planter",
    "minecart.planter",
)

SEEDS_PLANTS_SHORTNAME_SUBSTRINGS = (
    ".berry",
    "sunflower",
    "hemp",
    "corn",
    "potato",
    "pumpkin",
    "mushroom",
)

def resolve_category(shortname: str, raw_category: str) -> str:
    """
    Returns the final display category for an item.
    Seeds, clones, berries, planters etc. all get remapped to 'Seeds & Plants'
    regardless of what the Rust JSON says their category is.
    """
    sn = shortname.lower().strip() if shortname else ""
    if any(sn.startswith(p) for p in SEEDS_PLANTS_SHORTNAME_PREFIXES):
        return "Seeds & Plants"
    if any(sub in sn for sub in SEEDS_PLANTS_SHORTNAME_SUBSTRINGS):
        return "Seeds & Plants"
    return raw_category
