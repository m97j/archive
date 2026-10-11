"""Upload only encrypted application backups to an existing private dataset."""
import hashlib
import json
import os
from pathlib import Path

from huggingface_hub import HfApi, CommitOperationAdd, hf_hub_download

def main():
    api = HfApi(token=os.environ["HF_DATASET_TOKEN"])
    repository = os.environ.get("HF_PRIVATE_DATASET_REPOSITORY", "m97j/archive-private-data")
    if not api.repo_info(repository, repo_type="dataset").private:
        raise RuntimeError("PRIVATE_DATASET_REQUIRED")
    directory = Path(os.environ.get("ARCHIVE_BACKUP_DIRECTORY", ".backup-output"))
    receipt = json.loads((directory / "receipt.json").read_text(encoding="utf-8"))
    encrypted = directory / "application.dump.aesgcm"
    if receipt.get("verified") is not True or hashlib.sha256(encrypted.read_bytes()).hexdigest() != receipt["encryptedSha256"]:
        raise RuntimeError("VERIFIED_ENCRYPTED_BACKUP_REQUIRED")
    prefix = "backups/" + receipt["createdAt"][:10] + "/" + receipt["encryptedSha256"][:16]
    result = api.create_commit(repository, repo_type="dataset", commit_message="backup: preserve verified application snapshot", operations=[
        CommitOperationAdd(path_in_repo=prefix + "/application.dump.aesgcm", path_or_fileobj=str(encrypted)),
        CommitOperationAdd(path_in_repo=prefix + "/receipt.json", path_or_fileobj=str(directory / "receipt.json")),
    ])
    downloaded = hf_hub_download(repository, prefix + "/application.dump.aesgcm", repo_type="dataset", revision=result.oid, token=os.environ["HF_DATASET_TOKEN"])
    if hashlib.sha256(Path(downloaded).read_bytes()).hexdigest() != receipt["encryptedSha256"]:
        raise RuntimeError("REMOTE_BACKUP_HASH_MISMATCH")
    receipt["durableCopy"] = {"repository": repository, "revision": result.oid, "path": prefix + "/application.dump.aesgcm", "hashVerified": True}
    (directory / "receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps({"privateBackupStored": True, "revision": result.oid, "hashVerified": True}))

if __name__ == "__main__":
    try:
        main()
    except Exception:
        raise SystemExit("PRIVATE_BACKUP_UPLOAD_FAILED: no plaintext or credential output") from None
