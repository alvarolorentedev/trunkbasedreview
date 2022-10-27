# Trunk-Based Review

async peer reviewing for trunk-based development

# Motivation

Pull Requests seem to be a norm for many professionals in the software development business. Nevertheless, git flow is deemed legacy. This means there is a disconnection in between the preferred/know used peer review system and modern practices.

While doing [trunk-based development](https://www.atlassian.com/continuous-delivery/continuous-integration/trunk-based-development) and follow best practices like branching by abstraction and feature toggles.


Trunk-Based review tries to bridge this for teams that don't want or are unable to adapt to other modern agile peer review models like pair programming.

# Benefits

- Provides capability to teams to achieve continuous Deployment due to the immediate integration of code.
- Faster feedback loop.
- Smaller changes that help reduce MTTR.

# How it works

- Do trunk-based Development.
- Open comments and change request in the `main branch`.
- Answer comments and do changes in the `main branch`.
- Resolve conversations. 
- Move conversation to historical log of it.

# Tools

- [VS Code extension](https://marketplace.visualstudio.com/items?itemName=kanekotic.trunk-based-review)

