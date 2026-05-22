# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile\navigation-and-bottomnav.spec.ts >> Mobile navigation and bottom-nav usability >> bottom nav buttons are visible, tappable and not clipped
- Location: tests\mobile\navigation-and-bottomnav.spec.ts:6:7

# Error details

```
Error: browserContext.close: spawn EPERM
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e4]:
    - button "Open navigation" [ref=e5] [cursor=pointer]:
      - img [ref=e6]
    - generic [ref=e7]:
      - generic [ref=e8]: ⚕️
      - text: Sakhi
    - generic [ref=e10]:
      - img [ref=e11]
      - text: 10:04:05 AM
  - main [ref=e15]:
    - generic [ref=e16]:
      - generic [ref=e17]:
        - generic [ref=e18]:
          - heading "Clinic Command Center" [level=1] [ref=e19]
          - paragraph [ref=e20]: Sakhi Practice Management — Production V12.8
        - generic [ref=e21]:
          - generic [ref=e22]: "System Health: 0%"
          - button "🗑️ Trash" [ref=e23] [cursor=pointer]
          - combobox [ref=e24] [cursor=pointer]:
            - option "All Branches" [selected]
            - option "Dabholi Branch"
            - option "City Light Branch"
      - generic [ref=e25]:
        - generic [ref=e26]:
          - generic [ref=e27]: Branch Patients
          - generic [ref=e28]: "0"
        - generic [ref=e29]:
          - generic [ref=e30]: Actionable Follow-ups
          - generic [ref=e31]: "0"
        - generic [ref=e32]:
          - generic [ref=e33]: High-Risk Cases
          - generic [ref=e34]: "0"
        - generic [ref=e35]:
          - generic [ref=e36]: Clinical Success Rate
          - generic [ref=e37]: 0%
      - generic [ref=e38]:
        - generic [ref=e39]:
          - heading "⚠️ Clinical Priority Review" [level=3] [ref=e40]
          - generic [ref=e42]: No clinical risk patterns detected in this clinic.
        - generic [ref=e43]:
          - heading "Success Distribution" [level=3] [ref=e44]
          - img [ref=e46]
      - generic [ref=e47]:
        - heading "Communication & Reminder Queue" [level=3] [ref=e48]
        - generic [ref=e50]: Queue is currently clear.
      - generic [ref=e51]:
        - heading "🔐 Data Safety & Backup" [level=3] [ref=e52]
        - generic [ref=e53]:
          - button "📦 Download Backup" [ref=e54] [cursor=pointer]
          - generic [ref=e55] [cursor=pointer]: 📥 Restore Backup
        - generic [ref=e56]: ⚠️ Restoring backup will overwrite all existing data. Use carefully.
  - navigation "Primary mobile navigation" [ref=e57]:
    - button "Today" [ref=e58] [cursor=pointer]
    - button "Patients" [ref=e59] [cursor=pointer]
    - button "Consult" [ref=e60] [cursor=pointer]
    - button "Appt" [ref=e61] [cursor=pointer]
    - button "More" [active] [ref=e62] [cursor=pointer]
```