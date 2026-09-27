"""Выполнение ноутбуков текущим Python с сохранением графиков и проверок."""

import hashlib
import json
import logging
import os
import sys
from pathlib import Path

import nbformat
from jupyter_client import KernelManager
from jupyter_client.kernelspec import KernelSpecManager
from nbclient import NotebookClient

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    kernel_root = ROOT / "artifacts/notebook_runtime/kernels"
    kernel = kernel_root / "python3"
    kernel.mkdir(parents=True, exist_ok=True)
    (kernel / "kernel.json").write_text(
        json.dumps(
            {
                "argv": [sys.executable, "-m", "ipykernel_launcher", "-f", "{connection_file}"],
                "display_name": "Python 3",
                "language": "python",
            }
        ),
        encoding="utf-8",
    )
    os.environ["MPLBACKEND"] = "module://matplotlib_inline.backend_inline"
    results = []
    for path in sorted((ROOT / "notebooks").glob("*.ipynb")):
        notebook = nbformat.read(path, as_version=4)
        manager = KernelManager(
            kernel_name="python3",
            kernel_spec_manager=KernelSpecManager(kernel_dirs=[str(kernel_root)]),
        )
        client = NotebookClient(
            notebook, km=manager, timeout=180, resources={"metadata": {"path": str(ROOT.parent)}}
        )
        logging.info("Выполнение %s", path.name)
        client.execute(cleanup_kc=True)
        for cell in notebook.cells:
            cell.metadata.pop("execution", None)
        nbformat.validate(notebook)
        errors = [
            out
            for cell in notebook.cells
            if cell.cell_type == "code"
            for out in cell.outputs
            if out.output_type == "error"
        ]
        if errors:
            raise RuntimeError(f"Ошибки выполнения {path.name}")
        with path.open("w", encoding="utf-8", newline="\n") as stream:
            nbformat.write(notebook, stream)
        results.append(
            {
                "notebook": path.name,
                "code_cells": sum(c.cell_type == "code" for c in notebook.cells),
                "executed_cells": sum(
                    c.cell_type == "code" and c.execution_count is not None for c in notebook.cells
                ),
                "image_outputs": sum(
                    "image/png" in out.get("data", {})
                    for c in notebook.cells
                    if c.cell_type == "code"
                    for out in c.outputs
                ),
                "errors": len(errors),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
        )
    (ROOT / "reports/notebook_execution.json").write_text(
        json.dumps(results, indent=2), encoding="utf-8"
    )
    logging.info("Выполнение завершено: %s", results)


if __name__ == "__main__":
    main()
