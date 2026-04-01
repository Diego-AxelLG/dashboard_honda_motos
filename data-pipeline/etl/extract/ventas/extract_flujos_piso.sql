SELECT bit_fecha AS fecha,
case 
			when hus_ciudad ='Mexicali' then 8
            else 6
            end as Mui,
         
				COUNT( CASE WHEN fuente_fue_IDfuente=1 THEN 1 ELSE NULL END) AS FreshUp,
				COUNT( CASE WHEN fuente_fue_IDfuente=4 THEN 1 ELSE NULL END) AS Internet
				FROM hmcrm.contacto
        INNER JOIN hmcrm.bitacora bit 
        ON bit.bit_IDbitacora = (SELECT bit_IDbitacora FROM hmcrm.bitacora WHERE contacto_con_IDcontacto = contacto.con_IDcontacto ORDER BY bit_IDbitacora ASC LIMIT 1)
		INNER JOIN hmcrm.huser
		ON huser_hus_IDhuser = hus_IDhuser AND hus_tipo = 1 and hus_ciudad in ('Tijuana','Mexicali')
		WHERE con_status !='eliminado' AND con_status !='baseDatos' AND  year(bit_fecha)-year(current_date()) in (-1,0)
		GROUP BY fecha, mui
        order by mui, fecha desc	
        