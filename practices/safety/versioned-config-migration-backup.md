---
concern: safety
tech: [csharp, dotnet, json, config]
priority: recommended
source-repo: DeafDirectionalHelper
applies-to: [desktop-apps, cli-tools, any-app-with-user-config-files]
---
# Versioned Config Migration with Pre-Migration Backup

## PATTERN
User-editable config/settings files carry an explicit schema `version` field.
On load, a migration function upgrades any older shape to the current one, but
FIRST copies the original file to a version-stamped backup
(`settings.v{n}.bak.json`), and the migrated result is saved back to disk
immediately (not lazily on the next write). Migration maps retired fields onto
their replacements instead of dropping them, and applies the same mapping to
nested collections (e.g. per-profile copies of the settings).

## WHY
- The backup makes every migration reversible: a bad mapping never destroys
  the user's only copy of their configuration.
- Saving immediately after migration means the on-disk file, the backup, and
  the in-memory shape are consistent from the first run - no "half-migrated"
  state where the file only upgrades if the user happens to change a setting.
- Version-stamped backup names (`.v1.bak.json`) survive multiple migrations
  without overwriting each other, unlike a single `.bak`.
- Explicit old->new field mapping (rather than relying on deserialization
  defaults) preserves user intent, e.g. legacy display-mode enums mapped onto
  their closest new equivalent instead of resetting everyone to the default.

## EXAMPLE
From `Settings/SettingsManager.cs`:
```csharp
private AppSettings Migrate(AppSettings settings)
{
    if (settings.Version >= 3) return settings;

    WriteMigrationBackup(settings.Version);       // settings.v{n}.bak.json

    if (settings.Version < 2)
    {
        // map retired fields onto replacements, incl. nested collections
        settings.Bars.OverlayStyle = MapLegacyStyle(settings.Display.Mode, ...);
        foreach (var profile in settings.Profiles)
            profile.OverlayStyle = MapLegacyStyle(profile.DisplayMode, ...);
    }

    settings.Version = 3;
    _migrated = true;
    return settings;
}

// ctor:
_settings = Load();          // Load() calls Migrate()
if (_migrated) Save();       // persist the new shape immediately
```
Keep retired fields/enums on the model classes (unused by the app) so old
JSON still deserializes for the migration to read.

## CHECK
How to verify if a repo already follows this:
- [ ] Config model has an explicit schema `version` field
- [ ] Load path runs a migration for `version < current`
- [ ] A version-stamped backup of the original file is written before mutating
- [ ] Migrated settings are saved immediately, not on next user change
- [ ] Retired fields remain deserializable (not deleted from the model)

## IMPLEMENT
Steps to adopt this:
1. Add `version` (int) to the config model; default it to the CURRENT version
   so fresh installs skip migration.
2. In the loader, if `version < current`: copy the raw file to
   `<name>.v{version}.bak.json`, apply explicit field mappings (including any
   nested per-item copies), set `version = current`, flag `_migrated`.
3. After load, `if (_migrated) Save();`.
4. Never delete retired fields/enums from the model until no supported
   version can still contain them.

## NOTES
- Distinct from the "write .bak on every save" pattern (crash safety); this
  backup is specifically the pre-migration snapshot of the old schema.
- If a migration must infer intent (e.g. "user had a device configured, so
  keep FixedDevice mode instead of the new default"), prefer preserving the
  user's working behavior over the new-install default.
- Auto-discovered by practice-scout review from DeafDirectionalHelper v2.0.0
  UI-overhaul commit.
