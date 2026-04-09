# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This is the Mindvalley Bootcamp Demo project. (Update this section once the project stack and purpose are defined.)

## YOLO Mode (Auto-Accept Permissions)

This project ships with YOLO mode **enabled** in `.claude/settings.local.json`, which auto-approves all tool permissions so Claude can run without interruptions. This is ideal for the `/build` workflow where you want to walk away and let it finish.

**To disable YOLO mode** (require manual approval for each action):
- Delete or rename `.claude/settings.local.json`
- Or replace its contents with `{}`

**To re-enable YOLO mode:**
- Restore `.claude/settings.local.json` with the permission wildcards

Note: `settings.local.json` is gitignored by default and stays local to each user's machine. Each demo participant controls their own setting.
