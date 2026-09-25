---
title: Enable Events and Collabs
description: How to allow the server to run the disabled event and collab chapters.
tags: reTB
---

# ReTBpc
Open your reTBpc installation folder

Navigate to `...\reTBpc\reTB\tb_server`

Open `config.py` with a text editor (or append at the end with cat)

Add to the end:

```py
# Direct injection override
from tb_server.core.app_core import apply_config  # noqa: E402

_ = apply_config({
    "enable_retired_events": True,
    "enable_licensed_collabs": True
})
```
Restart everything

> Note that updating reTB might clear your changes and disable the events and collabs

# ReTBhost
For reTBhost you'll either need to build your own apk, see [custom-reTB.md](custom-reTB.md#tweak-further-1)

Or use [reTBhost working adult version](custom-reTB.md#android) that includes this and many other tweaks to the game