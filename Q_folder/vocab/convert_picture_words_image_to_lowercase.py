import os
import pandas as pd

# 定義目標檔案路徑
target_file = r"C:\Users\user\Documents\trae_projects\PokeEngmon\Q_folder\vocab\vocab.csv"

def convert_image_column_to_lowercase(file_path):
    if not os.path.exists(file_path):
        print(f"[-] 錯誤：找不到檔案 {file_path}")
        return

    print(f"[+] 正在讀取：{file_path}")
    df = pd.read_csv(file_path)
    
    # 只把 "Image" 欄位的資料轉為細階
    if "Image" in df.columns:
        df["Image"] = df["Image"].apply(lambda x: x.lower() if isinstance(x, str) else x)
        print("[+] 已將 [Image] 欄位的資料全部轉為細階。")
    else:
        print("[-] 找不到 Image 欄位。")

    # 覆蓋儲存回原本的 CSV 檔案
    df.to_csv(file_path, index=False, encoding="utf-8")
    print(f"[✔] 處理完成！Image 欄位已成功更新至：\n{file_path}")

if __name__ == "__main__":
    convert_image_column_to_lowercase(target_file)