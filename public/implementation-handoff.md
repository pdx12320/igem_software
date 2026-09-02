# PUF Studio — 顺序工作流与数据交接（v4）

## 用户操作

1. **01 Choose a window**：输入 RNA 与目标 C，选择一个 8–12 nt 识别长度和区间，点击底部 Next 进入 TRM 设计。区间只能在这一步修改。
2. **02 Design TRMs**：显示固定窗口，逐 repeat 选择 TRM。该页无区间比较、切换或自动换窗功能。
3. **03 LAMAR off-targets**：显示已选 TRM、相似序列与每个窗口下游 +2–5 的 C；导入 LAMAR 实际分数后展示排名。当前模型服务仍待接入。
4. **04 Review & export**：输出 TRM 方案、可组装的 PUF 序列及报告。01–03 底部有下一步，04 底部为下载报告；后续步骤可返回前一步。

主操作区只有单一识别长度和区间。离开01后，左侧显示固定目标摘要，通过“Edit in 01”回到窗口选择。更改TRM会保留窗口和RNA上下文。检索错配阈值内部固定为2；参考和模型导入位于 Data & models。

## 编辑窗口定义

设 RNA 目标 C 的 1-based 坐标为 p、识别长度 L、距离 d∈{2,3,4,5}：

- 识别窗口末端 e = p−d。
- 识别窗口起点 s = p−d−L+1。
- 目标 C 位置 = e+d。
- 紧接结合窗口后的第一个碱基是 +1。
- +2 对应中间有 1 个间隔碱基。界面不再使用 gap 术语。

Han et al. 2025, DOI 10.1038/s41467-025-64748-6，用户上传 PDF 第6页 / Figure 4：CU5.1、CU5.17 的编辑窗口为 +2–5，CU5.15 为 +2–4。实验背景为 ePUF10；将这一区间作为其他长度构型的设计先验时，须保留待验证标记。它不是所有 APOBEC 或所有 PUF 构型的普适硬边界。

对每个相似结合窗口，保留其下游 +2–5 的全部 C，并提取完整 101 nt 上下文。局部旁观者面板列出这一区间内目标之外的 C。PUF-independent 背景分支仍然保留参考集所有可构造完整上下文的 C，不因缺少近似 PUF motif 而删除。

## 已内置的数据

### TRM矩阵

来源：Zhou et al. 2021, DOI 10.1038/s41467-021-25433-6，用户 PDF 第7页 Figure 4。

- 按论文 R1–R8 × A/C/G/U 逐格转录，并视觉核对。
- TRM 顺序为 repeat 内第 12/13/16 位氨基酸。
- Figure4 红色标记表示作者用于组合设计的 TRM，不是定量最佳分数。
- 论文原始矩阵的“—”保留为空，不表示零结合。设计器使用下面的团队验证转移方案，从同一碱基的其他原生 repeat 行选择已有代码。
- 导出文件：`trm-matrix.json`，数值结合分数为 null。

### PUF12

用户文件：`PUF12_AF3_31_protein_sequences(2).fasta`。

- 31 条序列，全部 492 aa。
- WT：`00_PUF12-9_WT`。
- 其余 30 个变体仅在各自标题所指 R4–R8 的 TRM 位置发生改变，已逐条核对。
- 通过与 PDB 1M8Y 的 native PUM1 序列比对，得到重复单元对应关系。

| PUF12 repeat | Native PUM1 matrix row | PUF12 TRM绝对坐标（1-based） |
|---|---|---|
| R1 | R1 | 36,37,40 |
| R2 | R2 | 72,73,76 |
| R3 | R3 | 108,109,112 |
| R4 | R5 | 144,145,148 |
| R5 | R6 | 180,181,184 |
| R6 | R7 | 216,217,220 |
| R7 | R5 | 252,253,256 |
| R8 | R6 | 288,289,292 |
| R9 | R7 | 324,325,328 |
| R10 | R6 | 360,361,364 |
| R11 | R7 | 396,397,400 |
| R12 | R8 | 439,440,443 |

重复单元对应关系由序列同源性推断。团队于2026-09-01确认天然8R TRM匹配到8–12R具有实验可行性，网站将这一声明记录为团队实验验证。此表用于保留scaffold位置与默认候选的来源偏好。R12 前额外7 aa 片段保留。每个输出只替换指定 TRM 残基，完整保留492 aa WT的其他残基、两端和连接片段。

导出文件：`puf12-audit.json`（SHA-256、边界、映射、变体差异）、`puf12-input.fasta`（原始输入）、`puf-library.json`（可复用模块）。

### 8–12R 共用天然8R候选矩阵

项目团队已确认天然8R TRM匹配到8–12R的实验可行性。程序按A/C/G/U汇总天然8R各行实际出现的TRM，去重并保留全部来源行；每个8–12R repeat均可为其RNA碱基选择这些候选。不新增论文中没有的代码，也不将原始空格改写成实验结果。

默认选择为：若已有scaffold与同源原生repeat，先用该行候选；其中优先作者用于组合设计的代码；再按共同候选表顺序补充。9–11R尚无scaffold，直接使用按碱基汇总的候选表。这是界面的默认顺序，不是定量亲和力排序，也不等于每个新组合已有独立测量。

`puf-library.json` 的 `transferPolicy` 记录 `team_reported_experimentally_validated`、适用长度、团队确认日期与默认规则；`trmOptions` 提供没有scaffold时的TRM方案。每个模块的 `nativeRepeats` 保留原论文来源行。报告同时导出这些证据。

8R使用PDB 1M8Y native PUM1序列（349 aa）；12R使用用户提供WT（492 aa）。输出只更改TRM残基。

9–11R可以完整选择和导出TRM方案，完整蛋白序列须补充对应scaffold或明确构型方案。程序保留其蛋白序列为null，自定义JSON模块库可以补充架构。

## 全转录组 FASTA

全转录组扫描需要完整的转录本参考序列。标准物种推荐服务端预置一次并建索引，普通用户选择参考即可，无需每次上传大型文件。

建议固定：

- 物种和 assembly，例如人类 GRCh38。
- GENCODE / Ensembl 的明确 release。
- 全长 transcript FASTA（保留 UTR；全转录组声明需明确包含的非编码 transcript biotype），通常为压缩 `.fa.gz`。
- 匹配版本 GTF/GFF3，用于基因、外显子、UTR、基因组坐标及链方向注释。
- reference SHA-256、索引版本、转录本筛选规则和去重规则。

GENCODE提供 transcript sequences 和 matching annotation：https://www.gencodegenes.org/human/ 。只下载蛋白 FASTA 或仅 CDS 无法覆盖完整 RNA 脱靶空间。表达矩阵/TPM 可用于标记实验细胞中表达的转录本，属于可选增强，不能把 FASTA 扫描结果直接解释为细胞内发生编辑。

当前浏览器参考上限25,000 nt，累计匹配上限100,000；这是功能验证路径。服务器全转录组与 GPU 推理服务尚未接入。

## Lamar

当前仓库：https://github.com/pdx12320/PUF_fine_tuning_version1 。冻结模型输出属于序列排名；仅接收 RNA 的模型对同一窗口给出与 PUF 构型无关的分数。

输入要求：101 nt、转录本方向、中心 index50=C；边界不足的位点标记缺失，避免自行 padding 偏离训练规则。服务端 tokenizer 的 U/T 规范必须与训练代码一致。对于训练上下文来源于基因组的情况，需单独确认剪接连接处的转录本窗口是否属于支持域。

四模型集成的 rank population 必须固定，优化不同 PUF 时复用同一原始成员输出和同一参考全集。不要把候选集内重新归一化的排名当成跨设计可比较的概率。

预测导入格式：

```json
{
  "modelVersion": "frozen-model-version",
  "referenceSet": "species-release-fixed-ranking-universe",
  "scoreType": "ranking_score",
  "predictions": []
}
```

`predictions` 中每条为 `{context: 101nt RNA, score: actual 0–1 score}`。重复上下文可共享分数，但保留全部转录本/坐标映射。UI中的 Top LAMAR 是对应相似窗口 +2–5 各C的已导入最高分，缺失值不会填0。

## 服务器接口（待实现）

- `POST /v1/design-jobs`：target transcript/sequence、C coordinate、recognitionLength、bindingInterval、referenceVersion、scaffoldVersion、modelVersion。
- `GET /v1/design-jobs/{job_id}`：queued/running/failed/completed、覆盖数、缺失数。
- `GET /v1/design-jobs/{job_id}/report`：统一报告。

队列工作流程：校验坐标 → 保存用户选择 → TRM候选 → 索引检索相似motif → +2–5全部C上下文 → Lamar批量推理/缓存 → PUF-independent背景C分支 → 固定窗口的TRM方案与分数合并 → 报告。

## 验证

14项域测试涵盖 +2–5 的边界与 +1 排除、单长度四区间、相似窗口全C保留、目标排除、scaffold逐字重建、TRM之外残基保持、12R同源映射、30个变体的命名一致性、492aa输出、缺失scaffold时的TRM方案、原始矩阵空格保留与共用候选来源一致性、Lamar窗口与输入错误、重复序列资源保护，以及TRM修改保持已选窗口不变。

运行：`node --experimental-strip-types --test tests/design.test.mjs tests/report.test.mjs`

另有5项报告检查：内容一致性、真实零分与缺失区分、HTML转义、缺失scaffold输出与显示数量上限。

## Design Report 与偏好星标

- 主下载按钮生成独立 `PUF-Design-Report.html`：离线打开、打印或另存为PDF。
- `Raw data · JSON`保留全部数据，schemaVersion为3.1。易读报告展示至多50个相似窗口、30个有分数的背景C位点，显式标明总数与显示数。LAMAR缺失保留Unavailable，不填0；真实0分正常显示0.000。
- 报告将目标碱基、结合区间、TRM方案、蛋白序列、旁位C与脱靶排名放在同一份文档。所有用户文本进行HTML转义。
- `preferredForRepeat`星标的判定为：该TRM出现在本scaffold repeat所对应的天然矩阵行、当前碱基那一格。该格所有代码均为单星。跨行候选仍可选、无星。星标是定性矩阵支持，不使用作者红字冒充亲和力排名。
- 9–11R缺少对应scaffold/映射，不自动推断repeat偏好星标。
- 功能区保留参数、结果、错误、缺失状态与必要图例，详细解释和引用集中在Methods。

## 显示偏好与 APA 引用（2026-09-02）

每个 repeat 的偏好候选以金色星标按钮常显，点击直接选择；下方 Selected TRM 保留全部候选。偏好依据沿用原有矩阵，未新增亲和力分数或未提供的9–11R映射。

Methods 的文内引用及文末参考文献统一为 APA 7。作者全列、期刊与卷号斜体、DOI 使用链接；相同作者2002年的结构数据与论文用2002a/2002b区分。参考条目集中保存在 `data/references.json`。

### References

GENCODE. (n.d.). *Human release 50 (GRCh38.p14)*. Retrieved September 2, 2026, from [https://www.gencodegenes.org/human/](https://www.gencodegenes.org/human/)

Han, W., Yuan, B., Fan, X., Li, W., Yuan, Y., Zhang, Y., Wang, S., Shan, S., Hafner, M., Wang, Z., & Qiu, Z. (2025). Effective in vivo RNA base editing via engineered cytidine deaminase APOBECs fused with PUF proteins. *Nature Communications, 16*, Article 9727. [https://doi.org/10.1038/s41467-025-64748-6](https://doi.org/10.1038/s41467-025-64748-6)

pdx12320. (n.d.). *PUF_fine_tuning_version1* [Computer software]. GitHub. [https://github.com/pdx12320/PUF_fine_tuning_version1](https://github.com/pdx12320/PUF_fine_tuning_version1)

Wang, X., McLachlan, J., Zamore, P. D., & Hall, T. M. T. (2002a). *Crystal structure of the Pumilio-homology domain from human Pumilio1 in complex with NRE2-10 RNA* [Data set]. RCSB Protein Data Bank. [https://doi.org/10.2210/pdb1M8Y/pdb](https://doi.org/10.2210/pdb1M8Y/pdb)

Wang, X., McLachlan, J., Zamore, P. D., & Hall, T. M. T. (2002b). Modular recognition of RNA by a human Pumilio-homology domain. *Cell, 110*(4), 501–512. [https://doi.org/10.1016/S0092-8674(02)00873-5](https://doi.org/10.1016/S0092-8674(02)00873-5)

Zhou, W., Melamed, D., Banyai, G., Meyer, C., Tuschl, T., Wickens, M., Cao, J., & Fields, S. (2021). Expanding the binding specificity for RNA recognition by a PUF domain. *Nature Communications, 12*, Article 5107. [https://doi.org/10.1038/s41467-021-25433-6](https://doi.org/10.1038/s41467-021-25433-6)
