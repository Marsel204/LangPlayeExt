# JMdict attribution

`data/jmdict-common.json` uses the [JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project) dictionary files. These files are the property of the [Electronic Dictionary Research and Development Group](https://www.edrdg.org/) and are used in conformance with the Group's [licence](https://www.edrdg.org/edrdg/licence.html). A copy of that licence statement is in [EDRDG-LICENCE.txt](EDRDG-LICENCE.txt).

The data is licensed under [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Changes to this file must be shared under the same licence. LinguaPlay claims no copyright over the dictionary material.

## Source and documentation

- JMdict project and documentation: <https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project>
- Converted from the "common words" English JSON release of [jmdict-simplified](https://github.com/scriptin/jmdict-simplified).
- `tools/build_jmdict.py` keeps up to three senses of up to three glosses per entry. Its output records the source version and date in the file's `source` field.

## Updating

The licence requires current dictionary versions. Before each release, download the latest `jmdict-eng-common-*.json.zip` from the jmdict-simplified releases, unzip it, and run:

```sh
python3 tools/build_jmdict.py path/to/jmdict-eng-common-X.json
```
