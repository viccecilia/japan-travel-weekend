-- Read-only evidence for the disposable V5 database.
do $$
declare v_row record;v_titles text[];
begin
  for v_row in select * from public.list_public_product_catalog() where slug in ('kyoto-nara-classic','amanohashidate-ine','sanzenin-kibune-arashiyama-autumn') loop
    select array_agg(item->>'title' order by ord) into v_titles from jsonb_array_elements(v_row.content->'itinerary') with ordinality x(item,ord);
    if array_length(v_titles,1)<3 then raise exception 'FAIL % has incomplete itinerary',v_row.slug; end if;
    if exists(select 1 from jsonb_array_elements(v_row.content->'itinerary') item where coalesce(item->>'description','')='' or item->>'title' is null) then
      raise exception 'FAIL % has empty rich itinerary fields',v_row.slug;
    end if;
    if v_row.slug='sanzenin-kibune-arashiyama-autumn' and v_titles<>array['贵船神社','大原三千院','岚山·渡月桥'] then
      raise exception 'FAIL autumn order %',v_titles;
    end if;
  end loop;
  if (select count(*) from public.list_public_product_catalog() where slug in ('kyoto-nara-classic','amanohashidate-ine','sanzenin-kibune-arashiyama-autumn'))<>3 then raise exception 'FAIL sample routes missing'; end if;
  raise notice 'PASS V5 three published sample routes expose ordered rich itinerary content';
end$$;
