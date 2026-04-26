---
name: customer-repo-scaffold-preview
kind: program
---

### Services

- `customer-repo-planner`
- `customer-repo-preview-writer`

### Requires

- `lead_normalized_profile`: Json<NormalizedLeadProfile> - accepted lead profile from the program designer
- `lead_program_plan`: Markdown<SaveGrowProgramPlan> - Save/Grow program pair tailored to the lead

### Ensures

- `customer_repo_plan`: Json<CustomerRepoPlan> - files and responsibilities proposed for the customer repo
- `customer_repo_preview`: Json<CustomerRepoPreview> - scratch workspace file preview with hashes

### Effects

- `mutates_repo`: writes only to the authorized scratch workspace in local tests

## customer-repo-planner

### Requires

- `lead_normalized_profile`: Json<NormalizedLeadProfile> - accepted lead profile from the program designer
- `lead_program_plan`: Markdown<SaveGrowProgramPlan> - Save/Grow program pair tailored to the lead

### Ensures

- `customer_repo_plan`: Json<CustomerRepoPlan> - files and responsibilities proposed for the customer repo

### Effects

- `pure`: plans files without touching the filesystem

## customer-repo-preview-writer

### Requires

- `customer_repo_plan`: Json<CustomerRepoPlan> - files and responsibilities proposed for the customer repo

### Ensures

- `customer_repo_preview`: Json<CustomerRepoPreview> - scratch workspace file preview with hashes

### Effects

- `mutates_repo`: writes only to the authorized scratch workspace in local tests

