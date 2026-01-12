import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { Download } from 'lucide-react';

const SmartTable = ({ data, title, height = "500px" }) => {
  const [rowData, setRowData] = useState([]);
  const [columnDefs, setColumnDefs] = useState([]);
  const [gridApi, setGridApi] = useState(null);

  useEffect(() => {
    if (data && data.length > 0) {
      setRowData(data);

      const keys = Object.keys(data[0]);
      const cols = keys.map(key => ({
        field: key,
        headerName: key,
        filter: true,
        sortable: true,
        resizable: true,
        flex: 1,
        minWidth: 150
      }));
      setColumnDefs(cols);
    } else {
        setRowData([]);
    }
  }, [data]);


  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    floatingFilter: true,
    resizable: true,
  }), []);


  const onGridReady = (params) => {
    setGridApi(params.api);
  };


  const onFilterTextBoxChanged = useCallback(() => {
    if (gridApi) {
        gridApi.setGridOption(
            "quickFilterText",
            document.getElementById(`filter-text-box-${title}`).value
        );
    }
  }, [gridApi, title]);


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

            <input
                type="text"
                id={`filter-text-box-${title}`}
                placeholder="Быстрый поиск..."
                onInput={onFilterTextBoxChanged}
                style={{ padding: '8px', borderRadius: '5px', border: '1px solid #ddd', width: '200px' }}
            />

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

      <div className="ag-theme-quartz" style={{ height: height, width: '100%' }}>
        <AgGridReact
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          pagination={true}
          paginationPageSize={20}
          paginationPageSizeSelector={[20, 50, 100, 500]}
          onGridReady={onGridReady}
          rowSelection="multiple"
          animateRows={true}
        />
      </div>
    </div>
  );
};

export default SmartTable;