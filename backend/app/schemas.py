from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ProjectCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    idea_text: str = Field("", max_length=20000)
    github_url: str = Field("", max_length=300)
    domain: str = Field("", max_length=100)

    @model_validator(mode="after")
    def need_idea_or_repo(self):
        if len(self.idea_text.strip()) < 20 and not self.github_url.strip():
            raise ValueError("Provide a research idea (at least 20 characters) or a GitHub repository URL.")
        return self


class LiteratureRequest(BaseModel):
    queries: list[str] | None = None


class RefineMessage(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


class ProposalUpdate(BaseModel):
    proposal: dict
    approved: bool = False


class PlanOptions(BaseModel):
    weeks: int = Field(12, ge=2, le=52)
    team_size: int = Field(2, ge=1, le=10)
    compute: Literal["cpu", "single_gpu", "multi_gpu"] = "single_gpu"
    notes: str = Field("", max_length=1000)
