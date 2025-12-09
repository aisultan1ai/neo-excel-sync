// frontend/src/components/SmartTable.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react'; // React Grid Logic
import "ag-grid-community/styles/ag-grid.css"; // Core CSS
import "ag-grid-community/styles/ag-theme-quartz.css"; // Theme CSS
import { Download } from 'lucide-react';

const SmartTable = ({ data, title, height = "500px" }) => {
  const [rowData, setRowData] = useState([]);
  const [columnDefs, setColumnDefs] = useState([]);
  const [gridApi, setGridApi] = useState(null);

  // 1. Настройка колонок при получении данных
  useEffect(() => {
    if (data && data.length > 0) {
      setRowData(data);

      // Автоматически создаем заголовки на основе ключей первого объекта
      const keys = Object.keys(data[0]);
      const cols = keys.map(key => ({
        field: key,
        headerName: key, // Можно добавить словарь перевода, если нужно
        filter: true,     // Включаем фильтр в колонке
        sortable: true,   // Включаем сортировку
        resizable: true,  // Можно менять ширину
        flex: 1,          // Растягиваем на всю ширину
        minWidth: 150
      }));
      setColumnDefs(cols);
    } else {
        setRowData([]);
    }
  }, [data]);

  // 2. Общие настройки для всех колонок
  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    floatingFilter: true, // Поле поиска под заголовком колонки
    resizable: true,
  }), []);

  // 3. Сохраняем API таблицы, чтобы управлять ей (например, для экспорта CSV)
  const onGridReady = (params) => {
    setGridApi(params.api);
  };

  // 4. Глобальный поиск
  const onFilterTextBoxChanged = useCallback(() => {
    if (gridApi) {
        gridApi.setGridOption(
            "quickFilterText",
            document.getElementById(`filter-text-box-${title}`).value
        );
    }
  }, [gridApi, title]);

  // 5. Экспорт в CSV (встроенная фишка Ag-Grid)
  const exportToCsv = useCallback(() => {
      if (gridApi) {
          gridApi.exportDataAsCsv({ fileName: `${title}.csv` });
      }
  }, [gridApi, title]);

  if (!data || data.length === 0) {
    return (
        <div className="card" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
             <h3>{title}</h3>
             <p>Нет данных для отображения</p>
        </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0 }}>{title} <span style={{fontSize: '0.8em', color: '#666'}}>({rowData.length} строк)</span></h3>

        <div style={{ display: 'flex', gap: '10px' }}>
             {/* Поле быстрого поиска */}
            <input
                type="text"
                id={`filter-text-box-${title}`}
                placeholder="Быстрый поиск..."
                onInput={onFilterTextBoxChanged}
                style={{ padding: '8px', borderRadius: '5px', border: '1px solid #ddd', width: '200px' }}
            />

            {/* Кнопка экспорта CSV */}
            <button
                onClick={exportToCsv}
                className="btn-outline"
                title="Скачать CSV (текущий вид)"
                style={{ padding: '5px 10px', cursor: 'pointer', border: '1px solid #ccc', background: 'white', borderRadius: '5px' }}
            >
                <Download size={16} />
            </button>
        </div>
      </div>

      {/* Контейнер таблицы. Тема Quartz - современная и светлая */}
      <div className="ag-theme-quartz" style={{ height: height, width: '100%' }}>
        <AgGridReact
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          pagination={true}             // Включаем пагинацию
          paginationPageSize={20}       // Строк на странице по умолчанию
          paginationPageSizeSelector={[20, 50, 100, 500]} // Выбор размера страницы
          onGridReady={onGridReady}
          rowSelection="multiple"       // Можно выделять строки
          animateRows={true}            // Анимация при сортировке
        />
      </div>
    </div>
  );
};

export default SmartTable;