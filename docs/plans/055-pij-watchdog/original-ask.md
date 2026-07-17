# Original ask — pij-watchdog
**Captured**: 2026-07-17T00:20:00Z  ·  **By**: /the-flow

> "there was a feature idea that came from the pij orchestrator - pij first class watch dogs. What will happe is all pij sessions will auto get a watch dog at 20 mins. Each watch dog message tellsit how they can pause and resuem hte watchdog. pij sessions should keep watchdog running until they no longer doing active work. if they get a watch dog after active owrk, the know how to pause it. running compact on a peer will also auto pause watchdog." (Jordan, spine Seq 416/417)
>
> "we are going to impleemtn the pij watchdog so that next time limits happens it will auto resume." (Jordan, via s054's pane)
>
> "new feature, they can watch a pane - which when watchdog fires drops the tmux window pane text in so they can see it (not pij messages, if for exampe teh agent has run out of credits that will not be in pij logs - but also we dont want to drop too muchin each time cause it can get expensive asll these watch dogs)." (Jordan, ~14:35Z)
>
> Preamble amendment (Jordan in-pane, 2026-07-17): "ah for #4 doesnt require any special handling. if its usage limit or other blocker, it just keeps polling blind - once it frees up it will start working again. roabbly pij can detect if its stalled or stopped (stalled or some other similar unreponsive?) will happen when watchdog is polling but no new tokens / responses are being generated. its determistically deteted as unresponsive."
