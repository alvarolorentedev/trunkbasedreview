# Motivation

Pull Requests seem to be a norm for many professionals in the software development business. Nevertheless, branching strategies like gitflow is deemed [legacy](https://www.atlassian.com/continuous-delivery/continuous-integration/trunk-based-development). This means there is a disconnection in between the preferred/know used peer review system and modern practices.

**Trunk-Based review** tries to bridge this for teams that lack the capability to adapt to other modern agile peer review models like pair programming. Due to for example a lack of collocation or overlap in working hours.

Enabling to focus in continious delivery through [trunk-based development](https://www.atlassian.com/continuous-delivery/continuous-integration/trunk-based-development) and follow best practices like branching by abstraction and feature toggles.

# Benefits

- Provides capability to teams to achieve continuous Deployment due to the immediate integration of code.
- Faster feedback loop, through continious review of the codebase.
- Smaller changes are packed that help reduce MTTR.

# How it works

- Do trunk-based Development.
- Open comments and change request in the `main branch`.
- Answer comments and do changes in the `main branch`.
- Resolve conversations. 
- Move conversation to historical log of it.

# Tools

- [VS Code extension](https://marketplace.visualstudio.com/items?itemName=kanekotic.trunk-based-review)
